import { NextRequest, NextResponse } from "next/server";
import type {
  EmployeeLinkSource,
  EmployeeLinkSummary,
} from "@/app/lib/account-access";
import {
  buildExistingAccountSnapshot,
  getReviewLockMetadata,
  createAuditEntry,
  isValidEmail,
  normalizeEmail,
  normalizeCompany,
  normalizePermissions,
  getCompanyDirectoryContext,
} from "@/app/lib/account-requests.shared";
import {
  consumeDurableAccountRequestRateLimit,
  getAccountRequestsRequestDebug,
  getRequestIp,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { notifyDirectionOfAccountRequest } from "@/app/lib/notifications";

async function listAllAuthUsers() {
  const supabase = createAdminSupabaseClient();
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

type ChauffeurProfileRow = {
  id: number;
  auth_user_id?: string | null;
  courriel?: string | null;
};

function getPersistedEmployeeLinkStatus(
  auditLog: { details?: Record<string, unknown> }[] | null | undefined
) {
  const matchingEntry = [...(auditLog ?? [])]
    .reverse()
    .find((entry) => {
      const disposition = entry.details?.employeeProfileDisposition;
      return disposition === "created" || disposition === "existing";
    });

  const disposition = matchingEntry?.details?.employeeProfileDisposition;

  return disposition === "created" || disposition === "existing"
    ? disposition
    : null;
}

function buildEmployeeLinkSummary(options: {
  profile: ChauffeurProfileRow | null | undefined;
  source: EmployeeLinkSource;
  requestStatus: string;
  auditLog?: { details?: Record<string, unknown> }[] | null;
}): EmployeeLinkSummary {
  if (!options.profile?.id) {
    return {
      id: null,
      exists: false,
      status: "missing",
      label: "Fiche employe manquante",
      source: "none",
    };
  }

  const persistedStatus = getPersistedEmployeeLinkStatus(options.auditLog);
  const status =
    persistedStatus ??
    (options.source === "email" || options.requestStatus === "pending"
      ? "existing"
      : "created");

  return {
    id: options.profile.id,
    exists: true,
    status,
    label: status === "created" ? "Employe cree" : "Employe deja existant",
    source: options.source,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const fullName = String(body.fullName ?? "").trim();
    const email = normalizeEmail(body.email);
    const phone = String(body.phone ?? "").trim() || null;
    const company = normalizeCompany(body.company);
    const portalSource = body.portalSource === "direction" ? "direction" : "employe";
    const requestedRole =
      body.requestedRole === "direction" ? "direction" : "employe";
    const requestedPermissions = normalizePermissions(body.requestedPermissions);
    const message = String(body.message ?? "").trim() || null;
    const requestIp = getRequestIp(req);

    console.info("[account-requests][create] submit_received", {
      email,
      company: body.company ?? null,
      portalSource,
      requestedRole,
      requestIp,
    });

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Le nom complet et le courriel sont obligatoires." },
        { status: 400 }
      );
    }

    if (!body.company) {
      return NextResponse.json(
        { error: "La compagnie est obligatoire." },
        { status: 400 }
      );
    }

    if (!company) {
      return NextResponse.json(
        {
          error:
            "Compagnie invalide. Valeurs autorisees: oliem_solutions, titan_produits_industriels.",
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Le format du courriel est invalide." },
        { status: 400 }
      );
    }

    try {
      const rateLimit = await consumeDurableAccountRequestRateLimit(req, email);

      if (!rateLimit.ok) {
        return NextResponse.json(
          {
            error:
              "Trop de demandes ont ete envoyees. Veuillez patienter avant de recommencer.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimit.retryAfterSeconds),
            },
          }
        );
      }
    } catch {
      // Ignore temporary rate-limit backend failures and continue normal validation.
    }

    const accountRequestId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const payload = {
      id: accountRequestId,
      full_name: fullName,
      email,
      phone,
      company,
      portal_source: portalSource,
      requested_role: requestedRole,
      requested_permissions: requestedPermissions,
      message,
      status: "pending",
      created_at: createdAt,
      audit_log: [
        createAuditEntry("request_submitted", "requester", {
          ip: requestIp,
          details: {
            portalSource,
            requestedRole,
            requestedPermissions,
            company,
            companyDirectoryContext: getCompanyDirectoryContext(company),
          },
        }),
      ],
    };

    let supabase = createPublicServerSupabaseClient();

    try {
      supabase = createAdminSupabaseClient();
    } catch {
      // Fallback public client for local setup if the service role key is not yet configured.
    }

    const { error } = await supabase.from("account_requests").insert([payload]);

    if (error) {
      const normalizedMessage = error.message.toLowerCase();

      if (
        error.code === "23505" ||
        normalizedMessage.includes("duplicate key") ||
        normalizedMessage.includes("uq_account_requests_pending_email")
      ) {
        return NextResponse.json(
          { error: "Une demande en attente existe deja pour ce courriel." },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.info("[account-requests][create] request_stored", {
      requestId: accountRequestId,
      email,
      company,
      requestedRole,
      createdAt,
    });

    console.info("[account-requests][create] direction_alert_trigger", {
      requestId: accountRequestId,
      email,
      company,
      requestedRole,
    });

    const directionAlertResult = await notifyDirectionOfAccountRequest({
      requestId: accountRequestId,
      fullName,
      email,
      phone,
      company,
      requestedRole,
      requestedPermissions,
      portalSource,
      message,
      createdAt,
      managementUrl: "/direction/demandes-comptes",
    });

    console.info("[account-requests][create] direction_alert_result", {
      requestId: accountRequestId,
      ok: directionAlertResult.ok,
      skipped: directionAlertResult.skipped,
      reason: directionAlertResult.reason,
      recipients: directionAlertResult.recipients,
      invalidRecipients: directionAlertResult.invalidRecipients,
      providerMessageId: directionAlertResult.providerMessageId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur creation demande.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const requestDebug = getAccountRequestsRequestDebug(req);

  try {
    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        { error: "Appel refuse: requete non marquee comme navigateur authentifie." },
        { status: 400 }
      );
    }

    const { user, role } = await getStrictDirectionRequestUser(req);

    if (!user || role !== "direction") {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("account_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const authUsers = await listAllAuthUsers();
    const { data: chauffeurProfiles } = await supabase
      .from("chauffeurs")
      .select("id, auth_user_id, courriel")
      .order("id", { ascending: true });

    const userByEmail = new Map(
      authUsers
        .filter((user) => Boolean(user.email))
        .map((user) => [String(user.email).toLowerCase(), user] as const)
    );
    const profileById = new Map(
      ((chauffeurProfiles ?? []) as ChauffeurProfileRow[]).map((profile) => [
        String(profile.id),
        profile,
      ] as const)
    );
    const profileByAuthUserId = new Map(
      ((chauffeurProfiles ?? []) as ChauffeurProfileRow[])
        .filter((profile) => Boolean(profile.auth_user_id))
        .map((profile) => [String(profile.auth_user_id), profile] as const)
    );
    const profileByEmail = new Map(
      ((chauffeurProfiles ?? []) as ChauffeurProfileRow[])
        .filter((profile) => Boolean(profile.courriel))
        .map((profile) => [normalizeEmail(profile.courriel), profile] as const)
    );

    const enrichedRequests = (data ?? []).map((request) => {
      const existingAccount = userByEmail.get(String(request.email).toLowerCase());
      const existingChauffeurId = Number(
        existingAccount?.app_metadata?.chauffeur_id ??
          existingAccount?.user_metadata?.chauffeur_id ??
          NaN
      );
      const profileByExplicitId = Number.isFinite(existingChauffeurId)
        ? profileById.get(String(existingChauffeurId)) ?? null
        : null;
      const profileByLinkedAuthUser =
        existingAccount?.id ? profileByAuthUserId.get(existingAccount.id) ?? null : null;
      const profileByMatchingEmail =
        profileByEmail.get(String(request.email).toLowerCase()) ?? null;
      const matchedProfile =
        profileByExplicitId ?? profileByLinkedAuthUser ?? profileByMatchingEmail;
      const matchedProfileSource: EmployeeLinkSource = profileByExplicitId
        ? "profile_id"
        : profileByLinkedAuthUser
          ? "auth_user_id"
          : profileByMatchingEmail
            ? "email"
            : "none";

      return {
        ...request,
        existing_account: buildExistingAccountSnapshot(existingAccount),
        employee_link: buildEmployeeLinkSummary({
          profile: matchedProfile,
          source: matchedProfileSource,
          requestStatus: request.status,
          auditLog: request.audit_log,
        }),
        review_lock: getReviewLockMetadata(request.review_started_at),
      };
    });

    return NextResponse.json({ requests: enrichedRequests });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur chargement demandes.",
      },
      { status: 500 }
    );
  }
}
