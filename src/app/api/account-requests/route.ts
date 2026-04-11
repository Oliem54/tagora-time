import { NextRequest, NextResponse } from "next/server";
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
  resolveDirectionRequestUser,
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
    } catch (rateLimitError) {
      console.log("[account-requests] rate limit error:", rateLimitError);
    }

    const payload = {
      full_name: fullName,
      email,
      phone,
      company,
      portal_source: portalSource,
      requested_role: requestedRole,
      requested_permissions: requestedPermissions,
      message,
      status: "pending",
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

    console.log("[account-requests] payload:", payload);

    const { data, error } = await supabase
      .from("account_requests")
      .insert([payload]);

    console.log("[account-requests] data:", data);
    console.log("[account-requests] error:", error);
    console.log("[account-requests] error.message:", error?.message ?? null);
    console.log("[account-requests] error.details:", error?.details ?? null);
    console.log("[account-requests] error.hint:", error?.hint ?? null);
    console.log("[account-requests] error.code:", error?.code ?? null);

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

      return NextResponse.json(
        {
          error: error.message,
          debug: {
            message: error?.message ?? null,
            details: error?.details ?? null,
            hint: error?.hint ?? null,
            code: error?.code ?? null,
          },
        },
        { status: 500 }
      );
    }

    try {
      await notifyDirectionOfAccountRequest({
        fullName,
        email,
        requestedRole,
        portalSource,
      });
    } catch (notificationError) {
      console.log("[account-requests] notification error:", notificationError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[account-requests][POST] unexpected error", error);
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
  const includeDebug = req.nextUrl.searchParams.get("debug") === "1";
  const requestDebug = getAccountRequestsRequestDebug(req);

  console.log("API CALLED - AUTH HEADER:", req.headers.get("authorization"));

  console.log(
    "[account-requests][GET][received]",
    JSON.stringify({
      inferredSource: requestDebug.inferredSource,
      hasClientMarker: requestDebug.hasClientMarker,
      hasAuthorizationHeader: requestDebug.hasAuthorizationHeader,
      secFetchMode: requestDebug.secFetchMode,
      secFetchDest: requestDebug.secFetchDest,
      referer: requestDebug.referer,
    })
  );

  try {
    if (!requestDebug.hasClientMarker) {
      const debug = {
        apiRoute: "/api/account-requests",
        apiBlockReason: "non_client_account_requests_call",
        jwtRole: null,
        tokenRole: null,
        adminRole: null,
        userId: null,
        email: null,
        hasAuthorizationHeader: requestDebug.hasAuthorizationHeader,
        tokenReadable: false,
        adminReadable: false,
        roleMismatch: false,
        requestSource: requestDebug.inferredSource,
        clientMarker: requestDebug.clientMarker,
        denialReason: "non_client_account_requests_call",
        denialMessage:
          "La route /api/account-requests n accepte plus que les appels marques depuis le navigateur authentifie.",
      };

      console.error("[account-requests][GET] rejected unmarked call", debug);
      return NextResponse.json(
        {
          error: "Appel refuse: requete non marquee comme navigateur authentifie.",
          debug,
        },
        { status: 400 }
      );
    }

    const access = await resolveDirectionRequestUser(req);
    const debug = {
      apiRoute: "/api/account-requests",
      apiBlockReason: access.debug.apiBlockReason,
      jwtRole: access.debug.jwtRole,
      tokenRole: access.debug.tokenRole,
      adminRole: access.debug.adminRole,
      userId: access.debug.userId,
      email: access.debug.email,
      hasAuthorizationHeader: access.debug.hasAuthorizationHeader,
      tokenReadable: access.debug.tokenReadable,
      adminReadable: access.debug.adminReadable,
      roleMismatch: access.debug.roleMismatch,
      requestSource: requestDebug.inferredSource,
      clientMarker: requestDebug.clientMarker,
      frontGate: {
        areaRole: "direction",
        requiredPermission: null,
        blocksBeforeDataRead: false,
      },
      sqlFunctions: {
        current_app_role: "used by RLS, but not used by this API route",
        is_direction_user: "used by RLS, but not used by this API route",
        has_app_permission:
          "not required for /direction/demandes-comptes in AuthGate or API",
      },
      dataAccess: {
        source: "createAdminSupabaseClient",
        bypassesRls: true,
        accountRequestsPoliciesBlockDirectReadsForAuthenticatedUsers: true,
        profileTableUsedForThisPage: false,
        companyOrAccountStatusUsedToAuthorizePage: false,
      },
      denialReason: access.debug.apiBlockReason,
      denialMessage:
        access.debug.apiBlockReason === "missing_bearer_token"
          ? "La requete API est partie sans token Bearer."
          : access.debug.apiBlockReason === "token_user_lookup_failed"
            ? "Le token est present mais n a pas pu etre relu via auth.getUser()."
            : access.debug.apiBlockReason === "authenticated_user_missing"
              ? "Aucun utilisateur authentifie n a ete retrouve pour ce token."
              : access.debug.apiBlockReason === "admin_user_lookup_failed"
                ? "Le rechargement via auth.admin.getUserById() a echoue, mais le JWT peut rester exploitable."
                : access.debug.apiBlockReason === "admin_user_missing"
                  ? "Aucun utilisateur n a ete retourne par auth.admin.getUserById()."
                  : access.debug.apiBlockReason === "direction_role_missing"
                    ? "Aucune source de role ne confirme direction."
                    : null,
    };

    if (access.role !== "direction") {
      console.error("[account-requests][GET] access denied", debug);
      return NextResponse.json(
        {
          error: "Acces refuse.",
          debug,
        },
        { status: 403 }
      );
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
    const userByEmail = new Map(
      authUsers
        .filter((user) => Boolean(user.email))
        .map((user) => [String(user.email).toLowerCase(), user] as const)
    );

    const enrichedRequests = (data ?? []).map((request) => {
      const existingAccount = userByEmail.get(String(request.email).toLowerCase());

      return {
        ...request,
        existing_account: buildExistingAccountSnapshot(existingAccount),
        review_lock: getReviewLockMetadata(request.review_started_at),
      };
    });

    return NextResponse.json(
      includeDebug ? { requests: enrichedRequests, debug } : { requests: enrichedRequests }
    );
  } catch (error) {
    console.error("[account-requests][GET] unexpected error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur chargement demandes.",
        debug: includeDebug
          ? {
              denialReason: "unexpected_error",
              denialMessage:
                error instanceof Error ? error.message : "Erreur chargement demandes.",
            }
          : undefined,
      },
      { status: 500 }
    );
  }
}
