/**
 * Mémoire locale + mapping UI des résultats de plans persistés.
 * Aucun impact calcul.
 */

import type {
  GenericPayPlanTrace,
  PayPlanBeneficiaryDisplay,
} from "@/app/lib/commissions/generic-pay-plan.shared";

export type RecentPayPlanResultItem = {
  accrualId: string;
  organizationId: string;
  templateId: string;
  employeeId: number | null;
  beneficiaryPrimary: string;
  beneficiarySecondary: string | null;
  planName: string;
  versionLabel: string;
  ruleName: string;
  basisAmount: number;
  amount: number;
  status: string;
  processedAt: string;
};

const STORAGE_KEY = "tagora.admin.pay_plan_recent_results.v1";
const MAX_ITEMS = 12;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeItem(
  item: Partial<RecentPayPlanResultItem>
): RecentPayPlanResultItem | null {
  const accrualId = String(item.accrualId || "").trim();
  const organizationId = String(item.organizationId || "").trim();
  const templateId = String(item.templateId || "").trim();
  const amount = Number(item.amount);
  if (!accrualId || !organizationId || !templateId || !Number.isFinite(amount)) {
    return null;
  }
  const basisAmount = Number(item.basisAmount);
  const employeeIdRaw = Number(item.employeeId);
  const employeeId =
    Number.isInteger(employeeIdRaw) && employeeIdRaw > 0 ? employeeIdRaw : null;
  return {
    accrualId,
    organizationId,
    templateId,
    employeeId,
    beneficiaryPrimary:
      String(item.beneficiaryPrimary || "").trim() || "Bénéficiaire",
    beneficiarySecondary:
      item.beneficiarySecondary == null || item.beneficiarySecondary === ""
        ? null
        : String(item.beneficiarySecondary).trim(),
    planName: String(item.planName || "").trim() || "Plan",
    versionLabel: String(item.versionLabel || "").trim() || "—",
    ruleName: String(item.ruleName || "").trim() || "—",
    basisAmount: Number.isFinite(basisAmount) ? basisAmount : 0,
    amount,
    status: String(item.status || "").trim() || "calculated",
    processedAt:
      String(item.processedAt || "").trim() || new Date().toISOString(),
  };
}

export function toPersistedPayPlanResultItem(input: {
  accrualId: string;
  organizationId: string;
  status: string;
  createdAt?: string;
  trace: GenericPayPlanTrace;
  beneficiary: PayPlanBeneficiaryDisplay;
}): RecentPayPlanResultItem {
  const versionNumber = Number(input.trace.version_number);
  const employeeIdRaw = Number(
    input.beneficiary.employeeId ?? input.trace.employee_id
  );
  return {
    accrualId: String(input.accrualId || input.trace.accrual_id || "").trim(),
    organizationId: String(input.organizationId).trim(),
    templateId: String(input.trace.template_id).trim(),
    employeeId:
      Number.isInteger(employeeIdRaw) && employeeIdRaw > 0
        ? employeeIdRaw
        : null,
    beneficiaryPrimary: input.beneficiary.primary,
    beneficiarySecondary: input.beneficiary.secondary,
    planName: String(input.trace.template_name || "").trim() || "Plan",
    versionLabel: Number.isFinite(versionNumber)
      ? `Version ${versionNumber}`
      : "—",
    ruleName: String(input.trace.rule_name || "").trim() || "—",
    basisAmount: Number(input.trace.basis_amount) || 0,
    amount: Number(input.trace.calculated_amount) || 0,
    status: String(input.status || "").trim() || "calculated",
    processedAt:
      String(input.trace.processed_at || "").trim() ||
      String(input.createdAt || "").trim() ||
      new Date().toISOString(),
  };
}

export function rememberRecentPayPlanResult(
  item: RecentPayPlanResultItem,
  existing: RecentPayPlanResultItem[] = []
): RecentPayPlanResultItem[] {
  const cleaned = normalizeItem(item);
  if (!cleaned) {
    return existing.slice(0, MAX_ITEMS);
  }
  const next = [
    cleaned,
    ...existing.filter(
      (row) =>
        !(
          row.accrualId === cleaned.accrualId &&
          row.organizationId === cleaned.organizationId
        )
    ),
  ].slice(0, MAX_ITEMS);
  return next;
}

export function readRecentPayPlanResults(): RecentPayPlanResultItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) =>
        row && typeof row === "object"
          ? normalizeItem(row as Partial<RecentPayPlanResultItem>)
          : null
      )
      .filter((row): row is RecentPayPlanResultItem => row != null)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeRecentPayPlanResult(item: RecentPayPlanResultItem): void {
  if (!canUseStorage()) return;
  const next = rememberRecentPayPlanResult(item, readRecentPayPlanResults());
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function writeRecentPayPlanResults(
  items: RecentPayPlanResultItem[]
): void {
  if (!canUseStorage()) return;
  let next: RecentPayPlanResultItem[] = [];
  for (const item of items) {
    next = rememberRecentPayPlanResult(item, next);
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, MAX_ITEMS)));
}

export function filterRecentPayPlanResultsForOrganization(
  items: RecentPayPlanResultItem[],
  organizationId: string
): RecentPayPlanResultItem[] {
  const org = String(organizationId || "").trim();
  if (!org) return [];
  return items.filter((row) => row.organizationId === org);
}

export function filterRecentPayPlanResultsForTemplate(
  items: RecentPayPlanResultItem[],
  templateId: string
): RecentPayPlanResultItem[] {
  const id = String(templateId || "").trim();
  if (!id) return [];
  return items.filter((row) => row.templateId === id);
}
