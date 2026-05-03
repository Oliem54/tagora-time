/**
 * Lecture seule : événements et quart horodateur pour un employé / une journée.
 *
 * Usage :
 *   node --env-file=.env.local scripts/diagnose-horodateur-employee.mjs <employeeId> [YYYY-MM-DD]
 *
 * Sans date : affiche les work_date récents pour cet employé puis les 20 derniers événements.
 */

import { createClient } from "@supabase/supabase-js";

const LEGACY_TO_CANONICAL = {
  quart_debut: "punch_in",
  quart_fin: "punch_out",
  pause_debut: "break_start",
  pause_fin: "break_end",
  dinner_debut: "meal_start",
  dinner_fin: "meal_end",
  sortie_depart: "terrain_start",
  sortie_retour: "terrain_end",
  correction: "manual_correction",
  exception: "retroactive_entry",
  anomalie: "retroactive_entry",
};

const CANONICAL_TYPES = new Set([
  "punch_in",
  "punch_out",
  "break_start",
  "break_end",
  "meal_start",
  "meal_end",
  "terrain_start",
  "terrain_end",
  "manual_correction",
  "retroactive_entry",
]);

function canonicalType(eventType) {
  if (!eventType) return null;
  const v = String(eventType).trim();
  if (CANONICAL_TYPES.has(v)) return v;
  return LEGACY_TO_CANONICAL[v] ?? null;
}

function pickRow(row) {
  return {
    id: row.id,
    employee_id: row.employee_id,
    company_context: row.company_context ?? null,
    event_type: row.event_type,
    canonical_type: canonicalType(row.event_type),
    status: row.status,
    work_date: row.work_date,
    week_start_date: row.week_start_date ?? null,
    occurred_at: row.occurred_at ?? row.event_time ?? null,
    source_kind: row.source_kind ?? null,
    actor_role: row.actor_role ?? null,
    actor_user_id: row.actor_user_id ?? null,
    is_manual_correction: row.is_manual_correction ?? null,
    requires_approval: row.requires_approval ?? null,
    exception_code: row.exception_code ?? null,
    notes_preview:
      typeof row.notes === "string"
        ? row.notes.slice(0, 80) + (row.notes.length > 80 ? "…" : "")
        : typeof row.note === "string"
          ? row.note.slice(0, 80) + (row.note.length > 80 ? "…" : "")
          : null,
    created_at: row.created_at ?? null,
  };
}

async function main() {
  const employeeId = Number(process.argv[2]);
  const workDateArg = process.argv[3]?.trim();

  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    console.error("Usage: node --env-file=.env.local scripts/diagnose-horodateur-employee.mjs <employeeId> [YYYY-MM-DD]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (!workDateArg) {
    const { data: dates, error: dErr } = await supabase
      .from("horodateur_events")
      .select("work_date")
      .eq("employee_id", employeeId)
      .order("work_date", { ascending: false })
      .limit(200);

    if (dErr) {
      console.error("work_date list error:", dErr.message);
      process.exit(1);
    }

    const uniq = [...new Set((dates ?? []).map((r) => r.work_date).filter(Boolean))].slice(0, 14);
    console.log(JSON.stringify({ employeeId, recentWorkDates: uniq, hint: "Passer une date YYYY-MM-DD en 3e argument." }, null, 2));
  }

  const workDate = workDateArg || null;

  let eventsQuery = supabase
    .from("horodateur_events")
    .select("*")
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true });

  if (workDate) {
    eventsQuery = eventsQuery.eq("work_date", workDate);
  } else {
    eventsQuery = eventsQuery.limit(30);
  }

  const { data: events, error: eErr } = await eventsQuery;

  if (eErr) {
    console.error("horodateur_events error:", eErr.message);
    process.exit(1);
  }

  const rows = (events ?? []).map(pickRow);

  const includedInRecompute = rows.filter((r) => r.status === "normal" || r.status === "approuve");
  const excluded = rows.filter((r) => r.status !== "normal" && r.status !== "approuve");

  let shift = null;
  if (workDate) {
    const { data: s, error: sErr } = await supabase
      .from("horodateur_shifts")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("work_date", workDate)
      .maybeSingle();

    if (sErr) {
      console.error("horodateur_shifts error:", sErr.message);
    } else {
      shift = s;
    }
  }

  const summary = {
    employeeId,
    workDateFilter: workDate,
    eventCount: rows.length,
    includedInRecomputeCount: includedInRecompute.length,
    excludedByStatus: excluded.map((r) => ({ id: r.id, status: r.status, canonical_type: r.canonical_type })),
    directionLike: rows.filter((r) => r.actor_role === "direction" || r.source_kind === "direction"),
    shiftRow: shift,
  };

  console.log(JSON.stringify({ summary, events: rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
