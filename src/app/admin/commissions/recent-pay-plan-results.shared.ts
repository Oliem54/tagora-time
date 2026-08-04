/**
 * Mémoire locale des derniers résultats de plans (UI uniquement).
 * Aucune I/O réseau. Aucun impact calcul / API.
 */

export type RecentPayPlanResultItem = {
  accrualId: string;
  organizationId: string;
  templateId: string;
  beneficiaryPrimary: string;
  planName: string;
  amount: number;
  status: string;
  processedAt: string;
};

const STORAGE_KEY = "tagora.admin.pay_plan_recent_results.v1";
const MAX_ITEMS = 12;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function rememberRecentPayPlanResult(
  item: RecentPayPlanResultItem,
  existing: RecentPayPlanResultItem[] = []
): RecentPayPlanResultItem[] {
  const cleaned: RecentPayPlanResultItem = {
    accrualId: String(item.accrualId || "").trim(),
    organizationId: String(item.organizationId || "").trim(),
    templateId: String(item.templateId || "").trim(),
    beneficiaryPrimary: String(item.beneficiaryPrimary || "").trim() || "Bénéficiaire",
    planName: String(item.planName || "").trim() || "Plan",
    amount: Number(item.amount),
    status: String(item.status || "").trim() || "calculated",
    processedAt: String(item.processedAt || "").trim() || new Date().toISOString(),
  };
  if (
    !cleaned.accrualId ||
    !cleaned.organizationId ||
    !cleaned.templateId ||
    !Number.isFinite(cleaned.amount)
  ) {
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
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const item = row as Partial<RecentPayPlanResultItem>;
        if (!item.accrualId || !item.organizationId || !item.templateId) return null;
        return {
          accrualId: String(item.accrualId),
          organizationId: String(item.organizationId),
          templateId: String(item.templateId),
          beneficiaryPrimary: String(item.beneficiaryPrimary || "Bénéficiaire"),
          planName: String(item.planName || "Plan"),
          amount: Number(item.amount) || 0,
          status: String(item.status || "calculated"),
          processedAt: String(item.processedAt || ""),
        } satisfies RecentPayPlanResultItem;
      })
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

export function filterRecentPayPlanResultsForOrganization(
  items: RecentPayPlanResultItem[],
  organizationId: string
): RecentPayPlanResultItem[] {
  const org = String(organizationId || "").trim();
  if (!org) return [];
  return items.filter((row) => row.organizationId === org);
}
