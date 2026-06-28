import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { mapDirectionObjectiveOperationalRow } from "@/app/api/direction/commissions/_lib";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isCommissionGrantActiveRow,
  normalizeCommissionTimestamp,
} from "@/app/lib/commissions/sales-book-grants.shared";

export const EMPLOYEE_PROFILE_NOT_LINKED_MESSAGE =
  "Aucun profil employé lié à ce compte.";

export type EmployeeSalesBookObjectiveRow = {
  id: string;
  title: string;
  description: string | null;
  chauffeur_id: number;
  period_start: string;
  period_end: string;
  target_type: string;
  target_amount: number | null;
  target_sales_count: number | null;
  achieved_amount: number;
  achieved_sales_count: number;
  status: string;
  company_context: string | null;
  created_at: string;
  updated_at: string;
  entries_count: number;
  entries_pending_validation: number;
  entries_paid: number;
  total_sales_basis_amount: number;
  total_calculated_amount: number;
};

export type CommissionBookAccessGrantRecord = {
  id: string;
  owner_chauffeur_id: number;
  viewer_user_id: string;
  viewer_role: string;
  granted_by_admin_id: string;
  can_view: boolean;
  can_edit: boolean;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
  notes: string | null;
  is_active: boolean;
  owner_chauffeur_label: string | null;
};

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}


export async function requireEmployeSalesBookAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  if (role !== "employe") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces reserve aux employes." }, { status: 403 }),
    };
  }

  const supabase = createAdminSupabaseClient();
  const linkRes = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (linkRes.error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: linkRes.error.message }, { status: 500 }),
    };
  }

  const chauffeurId = asNumber((linkRes.data as { id?: unknown } | null)?.id);
  if (chauffeurId == null || chauffeurId <= 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: EMPLOYEE_PROFILE_NOT_LINKED_MESSAGE },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
    supabase,
    chauffeurId: Math.trunc(chauffeurId),
  };
}

export async function loadActiveGrantOwnerChauffeurIds(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  viewerUserId: string
) {
  const { data, error } = await supabase
    .from("commission_book_access_grants")
    .select("owner_chauffeur_id, revoked_at, expires_at, can_view")
    .eq("viewer_user_id", viewerUserId)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(
    new Set(
      (data ?? [])
        .filter((row) => isCommissionGrantActiveRow(row as Record<string, unknown>))
        .map((row) => Math.trunc(Number((row as { owner_chauffeur_id: unknown }).owner_chauffeur_id)))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}

export async function hasActiveGrantForChauffeur(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  viewerUserId: string,
  chauffeurId: number
) {
  const grantedIds = await loadActiveGrantOwnerChauffeurIds(supabase, viewerUserId);
  return grantedIds.includes(Math.trunc(chauffeurId));
}

function aggregateEntryStats(entries: Array<Record<string, unknown>>) {
  let entries_count = 0;
  let entries_pending_validation = 0;
  let entries_paid = 0;
  let total_sales_basis_amount = 0;
  let total_calculated_amount = 0;

  for (const entry of entries) {
    const status = String(entry.status ?? "");
    if (status === "cancelled") continue;
    entries_count += 1;
    if (status === "pending_validation") entries_pending_validation += 1;
    if (status === "paid") entries_paid += 1;
    total_sales_basis_amount += asNumber(entry.sales_basis_amount) ?? 0;
    total_calculated_amount += asNumber(entry.calculated_amount) ?? 0;
  }

  return {
    entries_count,
    entries_pending_validation,
    entries_paid,
    total_sales_basis_amount,
    total_calculated_amount,
  };
}

export async function loadEmployeeSalesBookObjectives(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  chauffeurId: number
): Promise<EmployeeSalesBookObjectiveRow[]> {
  const objectivesRes = await supabase
    .from("sales_objectives")
    .select("*")
    .eq("chauffeur_id", chauffeurId)
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false });

  if (objectivesRes.error) {
    throw new Error(objectivesRes.error.message);
  }

  const objectives = (objectivesRes.data ?? []) as Array<Record<string, unknown>>;
  if (objectives.length === 0) return [];

  const objectiveIds = objectives.map((row) => String(row.id));
  const entriesRes = await supabase
    .from("commission_entries")
    .select("objective_id, status, sales_basis_amount, calculated_amount")
    .eq("chauffeur_id", chauffeurId)
    .in("objective_id", objectiveIds);

  if (entriesRes.error) {
    throw new Error(entriesRes.error.message);
  }

  const entriesByObjective = new Map<string, Array<Record<string, unknown>>>();
  for (const row of entriesRes.data ?? []) {
    const record = row as Record<string, unknown>;
    const objectiveId = String(record.objective_id ?? "");
    if (!objectiveId) continue;
    const bucket = entriesByObjective.get(objectiveId) ?? [];
    bucket.push(record);
    entriesByObjective.set(objectiveId, bucket);
  }

  return objectives.map((row) => {
    const objectiveId = String(row.id ?? "");
    const stats = aggregateEntryStats(entriesByObjective.get(objectiveId) ?? []);
    const chauffeur_id = Math.trunc(asNumber(row.chauffeur_id) ?? chauffeurId);

    return {
      id: objectiveId,
      title: String(row.title ?? ""),
      description: typeof row.description === "string" ? row.description : null,
      chauffeur_id,
      period_start: String(row.period_start ?? ""),
      period_end: String(row.period_end ?? ""),
      target_type: String(row.target_type ?? ""),
      target_amount: asNumber(row.target_amount),
      target_sales_count:
        row.target_sales_count == null ? null : Math.trunc(asNumber(row.target_sales_count) ?? 0),
      achieved_amount: asNumber(row.achieved_amount) ?? 0,
      achieved_sales_count: Math.trunc(asNumber(row.achieved_sales_count) ?? 0),
      status: String(row.status ?? "draft"),
      company_context: typeof row.company_context === "string" ? row.company_context : null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      ...stats,
    };
  });
}

export async function loadDirectionGrantedOperationalObjectives(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  viewerUserId: string,
  options?: { chauffeurId?: number | null }
) {
  const grantedIds = await loadActiveGrantOwnerChauffeurIds(supabase, viewerUserId);
  if (grantedIds.length === 0) {
    return options?.chauffeurId != null ? ("forbidden" as const) : [];
  }

  let targetIds = grantedIds;
  if (options?.chauffeurId != null) {
    const chauffeurId = Math.trunc(options.chauffeurId);
    if (!grantedIds.includes(chauffeurId)) {
      return "forbidden" as const;
    }
    targetIds = [chauffeurId];
  }

  const objectivesRes = await supabase
    .from("sales_objectives")
    .select("*")
    .in("chauffeur_id", targetIds)
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false });

  if (objectivesRes.error) {
    throw new Error(objectivesRes.error.message);
  }

  const objectives = (objectivesRes.data ?? []) as Array<Record<string, unknown>>;
  if (objectives.length === 0) return [];

  const objectiveIds = objectives.map((row) => String(row.id));
  const entriesRes = await supabase
    .from("commission_entries")
    .select("objective_id, status")
    .in("objective_id", objectiveIds);

  if (entriesRes.error) {
    throw new Error(entriesRes.error.message);
  }

  const entriesByObjective = new Map<string, Array<Record<string, unknown>>>();
  for (const row of entriesRes.data ?? []) {
    const record = row as Record<string, unknown>;
    const objectiveId = String(record.objective_id ?? "");
    if (!objectiveId) continue;
    const bucket = entriesByObjective.get(objectiveId) ?? [];
    bucket.push(record);
    entriesByObjective.set(objectiveId, bucket);
  }

  return objectives.map((row) => {
    const objectiveId = String(row.id ?? "");
    const stats = aggregateEntryStats(entriesByObjective.get(objectiveId) ?? []);
    const operationalInput = {
      ...row,
      target_sales_count:
        row.target_type === "sales_count" ? row.target_sales_count : null,
      ...stats,
    };
    const mapped = mapDirectionObjectiveOperationalRow(operationalInput);
    return { ...mapped, team_name: null };
  });
}

export function mapCommissionBookAccessGrantRecord(
  row: Record<string, unknown>,
  ownerLabel?: string | null
): CommissionBookAccessGrantRecord {
  return {
    id: String(row.id ?? ""),
    owner_chauffeur_id: Math.trunc(asNumber(row.owner_chauffeur_id) ?? 0),
    viewer_user_id: String(row.viewer_user_id ?? ""),
    viewer_role: String(row.viewer_role ?? "direction"),
    granted_by_admin_id: String(row.granted_by_admin_id ?? ""),
    can_view: row.can_view !== false,
    can_edit: row.can_edit === true,
    created_at: String(row.created_at ?? ""),
    revoked_at: normalizeCommissionTimestamp(row.revoked_at),
    expires_at: normalizeCommissionTimestamp(row.expires_at),
    notes: typeof row.notes === "string" ? row.notes : null,
    is_active: isCommissionGrantActiveRow(row),
    owner_chauffeur_label: ownerLabel ?? null,
  };
}
