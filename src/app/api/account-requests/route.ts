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
  type AccountRequestCompany,
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
  nom?: string | null;
  courriel?: string | null;
  telephone?: string | null;
  actif?: boolean | null;
  notes?: string | null;
  primary_company?: AccountRequestCompany | null;
  taux_base_titan?: number | null;
  social_benefits_percent?: number | null;
  titan_billable?: boolean | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
  scheduled_work_days?: string[] | null;
  planned_daily_hours?: number | null;
  planned_weekly_hours?: number | null;
  pause_minutes?: number | null;
  expected_breaks_count?: number | null;
  break_1_label?: string | null;
  break_1_minutes?: number | null;
  break_1_paid?: boolean | null;
  break_2_label?: string | null;
  break_2_minutes?: number | null;
  break_2_paid?: boolean | null;
  break_3_label?: string | null;
  break_3_minutes?: number | null;
  break_3_paid?: boolean | null;
  break_am_enabled?: boolean | null;
  break_am_time?: string | null;
  break_am_minutes?: number | null;
  break_am_paid?: boolean | null;
  lunch_enabled?: boolean | null;
  lunch_time?: string | null;
  lunch_minutes?: number | null;
  lunch_paid?: boolean | null;
  break_pm_enabled?: boolean | null;
  break_pm_time?: string | null;
  break_pm_minutes?: number | null;
  break_pm_paid?: boolean | null;
  sms_alert_depart_terrain?: boolean | null;
  sms_alert_arrivee_terrain?: boolean | null;
  sms_alert_sortie?: boolean | null;
  sms_alert_retour?: boolean | null;
  sms_alert_pause_debut?: boolean | null;
  sms_alert_pause_fin?: boolean | null;
  sms_alert_dinner_debut?: boolean | null;
  sms_alert_dinner_fin?: boolean | null;
  sms_alert_quart_debut?: boolean | null;
  sms_alert_quart_fin?: boolean | null;
};

function buildEmployeeProfileSnapshot(
  profile: ChauffeurProfileRow | null | undefined,
  request: {
    full_name: string;
    email: string;
    phone: string | null;
    company: AccountRequestCompany | null;
  },
  authUserId: string | null
) {
  const benefitsPercent =
    profile?.social_benefits_percent != null
      ? Number(profile.social_benefits_percent)
      : 15;
  const hourlyRate =
    profile?.taux_base_titan != null ? Number(profile.taux_base_titan) : null;
  const expectedBreaksCount =
    profile?.expected_breaks_count != null
      ? Number(profile.expected_breaks_count)
      : 0;
  const breakAmEnabled =
    profile?.break_am_enabled ?? Boolean(profile?.break_1_minutes);
  const lunchEnabled =
    profile?.lunch_enabled ?? Boolean(profile?.break_2_minutes);
  const breakPmEnabled =
    profile?.break_pm_enabled ?? Boolean(profile?.break_3_minutes);
  const breakItems = [
    {
      label: "Pause AM",
      minutes:
        profile?.break_am_minutes != null
          ? Number(profile.break_am_minutes)
          : profile?.break_1_minutes != null
            ? Number(profile.break_1_minutes)
            : 0,
      paid: profile?.break_am_paid ?? profile?.break_1_paid ?? true,
      enabled: breakAmEnabled,
    },
    {
      label: "Diner",
      minutes:
        profile?.lunch_minutes != null
          ? Number(profile.lunch_minutes)
          : profile?.break_2_minutes != null
            ? Number(profile.break_2_minutes)
            : 0,
      paid: profile?.lunch_paid ?? profile?.break_2_paid ?? false,
      enabled: lunchEnabled,
    },
    {
      label: "Pause PM",
      minutes:
        profile?.break_pm_minutes != null
          ? Number(profile.break_pm_minutes)
          : profile?.break_3_minutes != null
            ? Number(profile.break_3_minutes)
            : 0,
      paid: profile?.break_pm_paid ?? profile?.break_3_paid ?? true,
      enabled: breakPmEnabled,
    },
  ];
  const totalBreakMinutes = breakItems.reduce(
    (sum, item) => sum + (item.enabled && item.minutes > 0 ? item.minutes : 0),
    0
  );
  const totalUnpaidBreakMinutes = breakItems.reduce(
    (sum, item) =>
      sum + (item.enabled && item.minutes > 0 && !item.paid ? item.minutes : 0),
    0
  );

  return {
    id: profile?.id ?? null,
    auth_user_id: profile?.auth_user_id ?? authUserId,
    nom: profile?.nom ?? request.full_name,
    courriel: profile?.courriel ?? request.email,
    telephone: profile?.telephone ?? request.phone,
    actif: profile?.actif ?? true,
    notes: profile?.notes ?? null,
    primary_company: profile?.primary_company ?? request.company ?? null,
    taux_base_titan: hourlyRate,
    social_benefits_percent: benefitsPercent,
    titan_billable: profile?.titan_billable ?? false,
    schedule_start: profile?.schedule_start ?? null,
    schedule_end: profile?.schedule_end ?? null,
    scheduled_work_days: Array.isArray(profile?.scheduled_work_days)
      ? profile?.scheduled_work_days
      : [],
    planned_daily_hours:
      profile?.planned_daily_hours != null
        ? Number(profile.planned_daily_hours)
        : null,
    planned_weekly_hours:
      profile?.planned_weekly_hours != null
        ? Number(profile.planned_weekly_hours)
        : null,
    pause_minutes:
      profile?.pause_minutes != null ? Number(profile.pause_minutes) : null,
    expected_breaks_count:
      expectedBreaksCount ||
      [breakAmEnabled, lunchEnabled, breakPmEnabled].filter(Boolean).length,
    break_1_label: "Pause AM",
    break_1_minutes: breakItems[0].minutes,
    break_1_paid: breakItems[0].paid,
    break_2_label: "Diner",
    break_2_minutes: breakItems[1].minutes,
    break_2_paid: breakItems[1].paid,
    break_3_label: "Pause PM",
    break_3_minutes: breakItems[2].minutes,
    break_3_paid: breakItems[2].paid,
    break_am_enabled: breakAmEnabled,
    break_am_time: profile?.break_am_time ?? null,
    break_am_minutes: breakItems[0].minutes,
    break_am_paid: breakItems[0].paid,
    lunch_enabled: lunchEnabled,
    lunch_time: profile?.lunch_time ?? null,
    lunch_minutes: breakItems[1].minutes,
    lunch_paid: breakItems[1].paid,
    break_pm_enabled: breakPmEnabled,
    break_pm_time: profile?.break_pm_time ?? null,
    break_pm_minutes: breakItems[2].minutes,
    break_pm_paid: breakItems[2].paid,
    sms_alert_depart_terrain: profile?.sms_alert_depart_terrain ?? true,
    sms_alert_arrivee_terrain: profile?.sms_alert_arrivee_terrain ?? true,
    sms_alert_sortie: profile?.sms_alert_sortie ?? true,
    sms_alert_retour: profile?.sms_alert_retour ?? true,
    sms_alert_pause_debut: profile?.sms_alert_pause_debut ?? true,
    sms_alert_pause_fin: profile?.sms_alert_pause_fin ?? true,
    sms_alert_dinner_debut: profile?.sms_alert_dinner_debut ?? true,
    sms_alert_dinner_fin: profile?.sms_alert_dinner_fin ?? true,
    sms_alert_quart_debut: profile?.sms_alert_quart_debut ?? true,
    sms_alert_quart_fin: profile?.sms_alert_quart_fin ?? true,
    total_break_minutes: totalBreakMinutes,
    total_unpaid_break_minutes: totalUnpaidBreakMinutes,
    billable_hourly_cost:
      hourlyRate != null
        ? Number((hourlyRate * (1 + benefitsPercent / 100)).toFixed(2))
        : null,
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

    try {
      await notifyDirectionOfAccountRequest({
        fullName,
        email,
        requestedRole,
        portalSource,
      });
    } catch {
      // Notification failures must not block the request flow.
    }

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
      .select(
        "id, auth_user_id, nom, courriel, telephone, actif, notes, primary_company, taux_base_titan, social_benefits_percent, titan_billable, schedule_start, schedule_end, scheduled_work_days, planned_daily_hours, planned_weekly_hours, pause_minutes, expected_breaks_count, break_1_label, break_1_minutes, break_1_paid, break_2_label, break_2_minutes, break_2_paid, break_3_label, break_3_minutes, break_3_paid, break_am_enabled, break_am_time, break_am_minutes, break_am_paid, lunch_enabled, lunch_time, lunch_minutes, lunch_paid, break_pm_enabled, break_pm_time, break_pm_minutes, break_pm_paid, sms_alert_depart_terrain, sms_alert_arrivee_terrain, sms_alert_sortie, sms_alert_retour, sms_alert_pause_debut, sms_alert_pause_fin, sms_alert_dinner_debut, sms_alert_dinner_fin, sms_alert_quart_debut, sms_alert_quart_fin"
      )
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
      const matchedProfile =
        (Number.isFinite(existingChauffeurId)
          ? profileById.get(String(existingChauffeurId))
          : null) ??
        (existingAccount?.id ? profileByAuthUserId.get(existingAccount.id) : null) ??
        profileByEmail.get(String(request.email).toLowerCase()) ??
        null;

      return {
        ...request,
        existing_account: buildExistingAccountSnapshot(existingAccount),
        employee_profile: buildEmployeeProfileSnapshot(
          matchedProfile,
          {
            full_name: request.full_name,
            email: request.email,
            phone: request.phone,
            company: request.company,
          },
          existingAccount?.id ?? null
        ),
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
