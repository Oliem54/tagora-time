import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import {
  notifyEmployeeScheduleRequestReviewed,
  type EmployeeNotifyChannelStatus,
} from "@/app/lib/employee-schedule-notify.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { mapScheduleRequestRow } from "@/app/lib/effectifs-schedule-request.shared";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json({ error: "Statut approuvé ou refusé requis." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const patch: Record<string, unknown> = {
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };
    if (typeof body?.review_note === "string" && body.review_note.trim()) {
      patch.review_note = body.review_note.trim();
    } else {
      patch.review_note = null;
    }

    const upd = await supabase
      .from("effectifs_employee_schedule_requests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (!upd.data) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }

    const row = upd.data as Record<string, unknown>;
    const employeeIdRaw = row.employee_id;
    const employeeId =
      typeof employeeIdRaw === "number"
        ? employeeIdRaw
        : typeof employeeIdRaw === "string"
          ? Number.parseInt(employeeIdRaw, 10)
          : NaN;

    const chauffeurRes = await supabase
      .from("chauffeurs")
      .select("nom, courriel, telephone")
      .eq("id", employeeIdRaw as string | number)
      .maybeSingle();

    const chauffeur = chauffeurRes.data as
      | { nom?: unknown; courriel?: unknown; telephone?: unknown }
      | null
      | undefined;
    const nom =
      chauffeur && typeof chauffeur.nom === "string" ? chauffeur.nom : null;

    const mapped = mapScheduleRequestRow(row, nom);

    type ReviewNotification = {
      emailStatus: EmployeeNotifyChannelStatus;
      smsStatus: EmployeeNotifyChannelStatus;
      approved: boolean;
    };

    let requestReviewNotification: ReviewNotification | undefined;

    if (Number.isFinite(employeeId) && chauffeur) {
      try {
        const r = await notifyEmployeeScheduleRequestReviewed({
          employeeId,
          nom,
          email: typeof chauffeur.courriel === "string" ? chauffeur.courriel : null,
          phone: typeof chauffeur.telephone === "string" ? chauffeur.telephone : null,
          approved: status === "approved",
        });
        requestReviewNotification = {
          emailStatus: r.emailStatus,
          smsStatus: r.smsStatus,
          approved: status === "approved",
        };
      } catch (notifyErr) {
        const e = notifyErr as { message?: string; code?: string; details?: string; hint?: string };
        console.error("[employee-schedule-notify]", "request_review_notify_unexpected", {
          employeeId,
          message: e?.message,
          code: e?.code,
          details: e?.details,
          hint: e?.hint,
        });
        requestReviewNotification = {
          emailStatus: "failed",
          smsStatus: "failed",
          approved: status === "approved",
        };
      }
    }

    return NextResponse.json({ request: mapped, requestReviewNotification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur revue demande." },
      { status: 500 }
    );
  }
}
