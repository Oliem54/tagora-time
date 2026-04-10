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
  try {
    const { role } = await getStrictDirectionRequestUser(req);

    if (role !== "direction") {
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
