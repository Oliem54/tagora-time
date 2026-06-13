import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { parseTierConfig } from "@/app/lib/commissions/calculate.server";
import {
  formatChauffeurDisplayLabel,
  type CommissionEntryRow,
  type CommissionRuleRow,
  type SalesObjectiveRow,
} from "@/app/lib/commissions/commissions.shared";

export const dynamic = "force-dynamic";

export async function requireCommissionsAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  if (role !== "direction" && role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces reserve a la direction/admin." }, { status: 403 }),
    };
  }
  if (!hasUserPermission(user, "commissions")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Permission commissions requise." },
        { status: 403 }
      ),
    };
  }
  const token = getRequestAccessToken(req).token;
  if (isJwtExplicitlyAal1Only(token)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Verification en deux etapes requise. Completez le MFA puis reessayez.",
          code: "MFA_AAL2_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export async function requireAdminFinanceCommissionsAccess(req: NextRequest) {
  const auth = await requireCommissionsAccess(req);
  if (!auth.ok) return auth;
  if (!hasAdminFinanceAccess(auth.user)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Acces reserve a l administration finance." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export function getUserDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  return fromMeta || user.email || "Direction";
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapObjectiveRow(
  row: Record<string, unknown>,
  chauffeurLabel?: string | null
): SalesObjectiveRow {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    chauffeur_id: asNumber(row.chauffeur_id),
    team_name: typeof row.team_name === "string" ? row.team_name : null,
    period_start: String(row.period_start ?? ""),
    period_end: String(row.period_end ?? ""),
    target_type: row.target_type === "sales_count" ? "sales_count" : "amount",
    target_amount: asNumber(row.target_amount),
    target_sales_count:
      row.target_sales_count == null ? null : Math.trunc(Number(row.target_sales_count)),
    achieved_amount: asNumber(row.achieved_amount) ?? 0,
    achieved_sales_count: Math.trunc(asNumber(row.achieved_sales_count) ?? 0),
    status: String(row.status ?? "draft") as SalesObjectiveRow["status"],
    company_context: typeof row.company_context === "string" ? row.company_context : null,
    created_by_name: typeof row.created_by_name === "string" ? row.created_by_name : null,
    updated_by_name: typeof row.updated_by_name === "string" ? row.updated_by_name : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    chauffeur_label: chauffeurLabel ?? null,
  };
}

export function mapRuleRow(row: Record<string, unknown>): CommissionRuleRow {
  return {
    id: String(row.id),
    objective_id: String(row.objective_id),
    rule_name: String(row.rule_name ?? "Commission"),
    rule_type:
      row.rule_type === "percentage" || row.rule_type === "tier_bonus"
        ? row.rule_type
        : "fixed",
    fixed_amount: asNumber(row.fixed_amount),
    percentage_rate: asNumber(row.percentage_rate),
    tier_config: parseTierConfig(row.tier_config),
    achievement_bonus_amount: asNumber(row.achievement_bonus_amount),
    is_active: row.is_active !== false,
  };
}

export function mapEntryRow(
  row: Record<string, unknown>,
  extras?: { objective_title?: string | null; assignee_label?: string | null }
): CommissionEntryRow {
  return {
    id: String(row.id),
    objective_id: String(row.objective_id),
    rule_id: row.rule_id == null ? null : String(row.rule_id),
    chauffeur_id: asNumber(row.chauffeur_id),
    team_name: typeof row.team_name === "string" ? row.team_name : null,
    label: String(row.label ?? ""),
    period_start: String(row.period_start ?? ""),
    period_end: String(row.period_end ?? ""),
    sales_basis_amount: asNumber(row.sales_basis_amount) ?? 0,
    calculated_amount: asNumber(row.calculated_amount) ?? 0,
    status: String(row.status ?? "estimated") as CommissionEntryRow["status"],
    validated_at: typeof row.validated_at === "string" ? row.validated_at : null,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: String(row.created_at ?? ""),
    objective_title: extras?.objective_title ?? null,
    assignee_label: extras?.assignee_label ?? null,
  };
}

export type ChauffeurProfileSummary = {
  label: string;
  nom: string | null;
  courriel: string | null;
};

export async function loadChauffeurProfiles(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  ids: number[]
) {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return new Map<number, ChauffeurProfileSummary>();

  const { data } = await supabase
    .from("chauffeurs")
    .select("id, nom, courriel")
    .in("id", unique);

  const map = new Map<number, ChauffeurProfileSummary>();
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const id = Number(record.id);
    if (!Number.isFinite(id)) continue;
    const nom = typeof record.nom === "string" ? record.nom.trim() : "";
    const courriel = typeof record.courriel === "string" ? record.courriel.trim() : "";
    map.set(id, {
      label: formatChauffeurDisplayLabel(record),
      nom: nom || null,
      courriel: courriel || null,
    });
  }
  return map;
}

export async function loadChauffeurLabels(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  ids: number[]
) {
  const profiles = await loadChauffeurProfiles(supabase, ids);
  const map = new Map<number, string>();
  for (const [id, profile] of profiles) {
    map.set(id, profile.label);
  }
  return map;
}

export function assigneeLabelFromObjective(
  objective: Pick<SalesObjectiveRow, "chauffeur_id" | "team_name" | "chauffeur_label">
) {
  if (objective.chauffeur_label?.trim()) return objective.chauffeur_label.trim();
  if (objective.team_name?.trim()) return objective.team_name.trim();
  if (objective.chauffeur_id != null) return `Employe #${objective.chauffeur_id}`;
  return "Non assigne";
}

export type DirectionObjectiveOperationalRow = {
  id: string;
  title: string;
  description: string | null;
  chauffeur_id: number | null;
  team_name: string | null;
  period_start: string;
  period_end: string;
  target_type: string;
  target_sales_count: number | null;
  achieved_sales_count: number;
  status: string;
  entries_count: number;
  entries_pending_validation: number;
  entries_paid: number;
  created_at: string;
  updated_at: string;
};

function parseNumeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapDirectionObjectiveOperationalRow(
  row: Record<string, unknown>
): DirectionObjectiveOperationalRow {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    chauffeur_id: row.chauffeur_id == null ? null : Math.trunc(parseNumeric(row.chauffeur_id)),
    team_name: typeof row.team_name === "string" ? row.team_name : null,
    period_start: String(row.period_start ?? ""),
    period_end: String(row.period_end ?? ""),
    target_type: String(row.target_type ?? ""),
    target_sales_count:
      row.target_sales_count == null ? null : Math.trunc(parseNumeric(row.target_sales_count)),
    achieved_sales_count: Math.trunc(parseNumeric(row.achieved_sales_count)),
    status: String(row.status ?? "draft"),
    entries_count: Math.trunc(parseNumeric(row.entries_count)),
    entries_pending_validation: Math.trunc(parseNumeric(row.entries_pending_validation)),
    entries_paid: Math.trunc(parseNumeric(row.entries_paid)),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

const FINANCIAL_OBJECTIVE_FIELDS = new Set([
  "target_amount",
  "achieved_amount",
]);

const FINANCIAL_RULE_FIELDS = new Set([
  "fixed_amount",
  "percentage_rate",
  "achievement_bonus_amount",
]);

export function bodyContainsCommissionFinancialFields(body: Record<string, unknown>) {
  for (const key of FINANCIAL_OBJECTIVE_FIELDS) {
    if (key in body) return true;
  }
  const rules = body.rules;
  if (Array.isArray(rules)) {
    for (const rawRule of rules) {
      if (!rawRule || typeof rawRule !== "object") continue;
      for (const key of FINANCIAL_RULE_FIELDS) {
        if (key in (rawRule as Record<string, unknown>)) return true;
      }
    }
  }
  return false;
}
