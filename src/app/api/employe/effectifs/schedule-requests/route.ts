import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  EFFECTIFS_SCHEDULE_REQUEST_TYPES,
  mapScheduleRequestRow,
} from "@/app/lib/effectifs-schedule-request.shared";
import { normalizeEffectifsDepartmentKey } from "@/app/lib/effectifs-departments.shared";
import { notifyDirectionNewPendingScheduleRequest } from "@/app/lib/effectifs-schedule-request-notify.server";
import type { EffectifsScheduleRequestType } from "@/app/lib/effectifs-schedule-request.shared";

export const dynamic = "force-dynamic";

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeTimeInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim().slice(0, 8);
  return /^\d{2}:\d{2}(:\d{2})?$/.test(s) ? s : null;
}

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || role !== "employe") {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const linkRes = await supabase
      .from("chauffeurs")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const employeeId = (linkRes.data as { id?: unknown } | null)?.id;
    if (typeof employeeId !== "number" || !Number.isFinite(employeeId)) {
      return NextResponse.json(
        { error: "Profil employé non lié. Contactez la direction." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
    }

    const request_type =
      typeof body.request_type === "string" ? body.request_type.trim() : "";
    if (
      !EFFECTIFS_SCHEDULE_REQUEST_TYPES.includes(
        request_type as (typeof EFFECTIFS_SCHEDULE_REQUEST_TYPES)[number]
      )
    ) {
      return NextResponse.json({ error: "Type de demande invalide." }, { status: 400 });
    }

    const requested_date = normalizeDateInput(body.requested_date);
    const requested_start_date = normalizeDateInput(body.requested_start_date);
    const requested_end_date = normalizeDateInput(body.requested_end_date);
    const start_time = normalizeTimeInput(body.start_time);
    const end_time = normalizeTimeInput(body.end_time);
    const is_full_day = body.is_full_day === true;

    let target_department_key: string | null = null;
    if (body.target_department_key != null && body.target_department_key !== "") {
      const dk = normalizeEffectifsDepartmentKey(String(body.target_department_key));
      if (!dk) {
        return NextResponse.json({ error: "Département cible invalide." }, { status: 400 });
      }
      target_department_key = dk;
    }

    const target_location =
      body.target_location === null || body.target_location === ""
        ? null
        : String(body.target_location).trim() || null;

    const reason =
      typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    if (!reason) {
      return NextResponse.json(
        { error: "Veuillez inscrire une justification pour cette demande." },
        { status: 400 }
      );
    }

    if (request_type === "vacation") {
      if (!requested_start_date || !requested_end_date) {
        return NextResponse.json(
          { error: "Dates de début et de fin requises pour les vacances." },
          { status: 400 }
        );
      }
      if (requested_end_date < requested_start_date) {
        return NextResponse.json(
          { error: "La date de fin ne peut pas être avant la date de début." },
          { status: 400 }
        );
      }
    } else {
      if (!requested_date) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
    }

    if (request_type === "remote_work" || request_type === "other") {
      if (!requested_date && !(requested_start_date && requested_end_date)) {
        return NextResponse.json(
          { error: "Date ou période obligatoire pour cette demande." },
          { status: 400 }
        );
      }
      if (
        requested_start_date &&
        requested_end_date &&
        requested_end_date < requested_start_date
      ) {
        return NextResponse.json(
          { error: "La date de fin ne peut pas être avant la date de début." },
          { status: 400 }
        );
      }
    }

    if (request_type === "change_shift" || request_type === "partial_absence") {
      if (!requested_date || !start_time || !end_time) {
        return NextResponse.json(
          { error: "Date, heure début et heure fin sont obligatoires." },
          { status: 400 }
        );
      }
    }

    if (request_type === "late_arrival" || request_type === "start_later") {
      if (!requested_date || !start_time) {
        return NextResponse.json(
          { error: "Date et nouvelle heure d’arrivée obligatoires." },
          { status: 400 }
        );
      }
    }

    if (request_type === "leave_early") {
      if (!requested_date || !end_time) {
        return NextResponse.json(
          { error: "Date et heure de départ demandée obligatoires." },
          { status: 400 }
        );
      }
    }

    const insertRes = await supabase
      .from("effectifs_employee_schedule_requests")
      .insert({
        employee_id: employeeId,
        request_type,
        requested_date,
        requested_start_date:
          request_type === "vacation" || request_type === "remote_work" || request_type === "other"
            ? requested_start_date
            : null,
        requested_end_date:
          request_type === "vacation" || request_type === "remote_work" || request_type === "other"
            ? requested_end_date
            : null,
        is_full_day: request_type === "day_off" || request_type === "vacation" || is_full_day,
        start_time,
        end_time,
        target_department_key,
        target_location,
        reason,
        status: "pending",
      })
      .select("*")
      .maybeSingle();

    if (insertRes.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    const nomRes = await supabase
      .from("chauffeurs")
      .select("nom")
      .eq("id", employeeId)
      .maybeSingle();
    const nom =
      nomRes.data && typeof (nomRes.data as { nom?: unknown }).nom === "string"
        ? (nomRes.data as { nom: string }).nom
        : null;

    const mapped = insertRes.data
      ? mapScheduleRequestRow(insertRes.data as Record<string, unknown>, nom)
      : null;

    const row = insertRes.data as Record<string, unknown> | null;
    const requestId = typeof row?.id === "string" ? row.id : null;
    if (requestId) {
      const isFullDayInsert =
        request_type === "day_off" || request_type === "vacation" || is_full_day;
      void notifyDirectionNewPendingScheduleRequest({
        requestId,
        employeeName: nom,
        requestType: request_type as EffectifsScheduleRequestType,
        requestedDate: requested_date,
        requestedStartDate: requested_start_date,
        requestedEndDate: requested_end_date,
        startTime: start_time,
        endTime: end_time,
        isFullDay: isFullDayInsert,
        reason,
      });
    }

    return NextResponse.json({ request: mapped }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur création demande.",
      },
      { status: 500 }
    );
  }
}
