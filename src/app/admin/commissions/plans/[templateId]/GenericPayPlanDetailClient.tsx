"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import {
  formatPayPlanRuleKindLabel,
  formatPayPlanVersionSummaryDate,
  PayPlanDateField,
  PayPlanField,
  PayPlanFieldStack,
  PayPlanMetaLine,
  PayPlanStatusBadge,
} from "@/app/admin/commissions/plans/pay-plan-readability";
import { CommissionNavButtons } from "@/app/admin/commissions/commission-module-ui";
import {
  filterRecentPayPlanResultsForOrganization,
  filterRecentPayPlanResultsForTemplate,
  readRecentPayPlanResults,
  writeRecentPayPlanResult,
  writeRecentPayPlanResults,
  type RecentPayPlanResultItem,
} from "@/app/admin/commissions/recent-pay-plan-results.shared";
import { resolvePayPlanBeneficiaryDisplay } from "@/app/lib/commissions/generic-pay-plan.shared";

type DetailProps = { templateId: string };

type Employee = { id: number; label: string };

export default function GenericPayPlanDetailClient({ templateId }: DetailProps) {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get("organization_id") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [conditions, setConditions] = useState<Record<string, unknown>[]>([]);
  const [tiers, setTiers] = useState<Record<string, unknown>[]>([]);
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [ratePercent, setRatePercent] = useState("5");
  const [minimumVolume, setMinimumVolume] = useState("0");
  const [tierThreshold, setTierThreshold] = useState("0");
  const [employeeId, setEmployeeId] = useState("");
  const [saleAmount, setSaleAmount] = useState("1000");
  const [soldAt, setSoldAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [lastAccrualId, setLastAccrualId] = useState<string | null>(null);
  const [persistedLastAccrualId, setPersistedLastAccrualId] = useState<
    string | null
  >(null);

  const rememberedLastAccrualId = useMemo(() => {
    if (!organizationId || !templateId) return null;
    const latest = filterRecentPayPlanResultsForTemplate(
      filterRecentPayPlanResultsForOrganization(
        readRecentPayPlanResults(),
        organizationId
      ),
      templateId
    )[0];
    return latest?.accrualId || null;
  }, [organizationId, templateId]);

  const draftVersion = useMemo(
    () => versions.find((row) => row.status === "draft") || null,
    [versions]
  );
  const activeVersion = useMemo(
    () => versions.find((row) => row.status === "active") || null,
    [versions]
  );
  const workingVersion = draftVersion || activeVersion;
  const workingRules = useMemo(
    () =>
      rules.filter((row) => row.version_id === workingVersion?.id),
    [rules, workingVersion]
  );
  const primaryRule = workingRules[0] || null;
  const activeAssignment = useMemo(
    () =>
      assignments.find(
        (row) =>
          row.status === "active" && row.plan_version_id === activeVersion?.id
      ) || null,
    [assignments, activeVersion]
  );
  const activeAssignmentBeneficiary = useMemo(() => {
    if (!activeAssignment) return null;
    const employeeId = Number(activeAssignment.employee_id);
    const employee = employees.find((row) => row.id === employeeId);
    return resolvePayPlanBeneficiaryDisplay({
      employeeId,
      displayName: employee?.label || null,
    });
  }, [activeAssignment, employees]);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setError("Organisation manquante.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [detailRes, employeesRes, resultsRes] = await Promise.all([
      commissionsFetch(
        `/api/admin/generic-pay-plans/${templateId}?organization_id=${encodeURIComponent(organizationId)}`
      ),
      commissionsFetch(
        `/api/admin/generic-pay-plans/employees?organization_id=${encodeURIComponent(organizationId)}`
      ),
      commissionsFetch(
        `/api/admin/generic-pay-plans/results?organization_id=${encodeURIComponent(organizationId)}&template_id=${encodeURIComponent(templateId)}`
      ),
    ]);
    const detail = (await detailRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const employeesJson = (await employeesRes.json().catch(() => ({}))) as {
      employees?: Employee[];
      error?: string;
    };
    const resultsJson = (await resultsRes.json().catch(() => ({}))) as {
      results?: RecentPayPlanResultItem[];
    };
    setLoading(false);
    if (!detailRes.ok) {
      setError(String(detail.error || "Chargement impossible."));
      return;
    }
    setTemplate((detail.template as Record<string, unknown>) || null);
    setVersions((detail.versions as Record<string, unknown>[]) || []);
    setRules((detail.rules as Record<string, unknown>[]) || []);
    setConditions((detail.conditions as Record<string, unknown>[]) || []);
    setTiers((detail.tiers as Record<string, unknown>[]) || []);
    setAssignments((detail.assignments as Record<string, unknown>[]) || []);
    if (employeesRes.ok) {
      setEmployees(employeesJson.employees || []);
    }
    if (resultsRes.ok && Array.isArray(resultsJson.results)) {
      writeRecentPayPlanResults(resultsJson.results);
      setPersistedLastAccrualId(resultsJson.results[0]?.accrualId || null);
    } else {
      setPersistedLastAccrualId(null);
    }
  }, [organizationId, templateId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(
    label: string,
    action: () => Promise<Response>
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const res = await action();
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);
    if (!res.ok) {
      setError(String(json.error || `${label} impossible.`));
      return null;
    }
    setSuccess(`${label} réussi.`);
    await reload();
    return json;
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="ui-text-muted">Chargement du plan…</p>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="page-container">
        <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
          {error || "Plan introuvable."}
        </p>
        <Link href="/admin/commissions/plans">Retour à la liste</Link>
      </main>
    );
  }

  const resultAccrualId =
    lastAccrualId || persistedLastAccrualId || rememberedLastAccrualId;

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        className="ui-page-header-premium-2027"
        title={String(template.display_name)}
        subtitle={String(template.template_code)}
        showNavigation={false}
        navigation={<AdminCommissionsNavigation variant="plans" />}
      />

      <div className="ui-stack" style={{ marginTop: 20, gap: 20 }}>
        <CommissionNavButtons
          links={[
            {
              href: `/admin/commissions/plans?organization_id=${encodeURIComponent(organizationId)}`,
              label: "Tous les plans",
            },
            ...(resultAccrualId
              ? [
                  {
                    href: `/admin/commissions/plans/results/${resultAccrualId}?organization_id=${encodeURIComponent(organizationId)}`,
                    label: "Voir le dernier résultat",
                    primary: true as const,
                  },
                ]
              : []),
            {
              href: "/admin/commissions#resultats-plans",
              label: "Retour aux résultats",
            },
            {
              href: "/admin/commissions",
              label: "Retour au tableau",
            },
          ]}
        />

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PayPlanStatusBadge status={String(template.status)} />
          <span style={{ fontWeight: 700, color: "#111827" }}>
            {String(template.template_code)}
          </span>
        </div>

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: "#166534", fontWeight: 700 }}>
            {success}
          </p>
        ) : null}

        <SectionCard title="1. Version">
          <PayPlanFieldStack>
            {workingVersion ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                }}
              >
                <PayPlanMetaLine
                  label="Numéro"
                  value={`v${String(workingVersion.version_number)}`}
                />
                <div style={{ display: "grid", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#6b7280",
                    }}
                  >
                    Statut
                  </span>
                  <PayPlanStatusBadge status={String(workingVersion.status)} />
                </div>
                {workingVersion.effective_from != null &&
                String(workingVersion.effective_from).trim() !== "" ? (
                  <PayPlanMetaLine
                    label="Date d’effet"
                    value={formatPayPlanVersionSummaryDate(
                      workingVersion.effective_from
                    )}
                  />
                ) : null}
              </div>
            ) : (
              <p className="ui-text-muted">Aucune version. Créez un brouillon.</p>
            )}
            <PayPlanDateField
              label="Date d’effet"
              value={effectiveFrom}
              onChange={setEffectiveFrom}
            />
            {!draftVersion ? (
              <div>
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={busy}
                  onClick={() =>
                    void run("Création de version", () =>
                      commissionsFetch(
                        `/api/admin/generic-pay-plans/${templateId}/versions`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            organization_id: organizationId,
                            effective_from: effectiveFrom,
                          }),
                        }
                      )
                    )
                  }
                >
                  Créer une version brouillon
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={busy}
                  onClick={() =>
                    void run("Activation", () =>
                      commissionsFetch(
                        `/api/admin/generic-pay-plans/versions/${draftVersion.id}/activate`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            organization_id: organizationId,
                            effective_from: effectiveFrom,
                          }),
                        }
                      )
                    )
                  }
                >
                  Activer la version
                </button>
              </div>
            )}
          </PayPlanFieldStack>
        </SectionCard>

        <SectionCard title="2. Règle et condition / palier">
          <PayPlanFieldStack>
            {primaryRule ? (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                }}
              >
                <PayPlanMetaLine
                  label="Règle"
                  value={String(primaryRule.display_name)}
                />
                <PayPlanMetaLine
                  label="Type"
                  value={formatPayPlanRuleKindLabel(primaryRule.rule_kind)}
                />
              </div>
            ) : (
              <p className="ui-text-muted">Aucune règle sur la version courante.</p>
            )}
            <PayPlanField label="Pourcentage">
              <input
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                inputMode="decimal"
              />
            </PayPlanField>
            {draftVersion && !primaryRule ? (
              <div>
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={busy}
                  onClick={() =>
                    void run("Création de règle", () =>
                      commissionsFetch(
                        `/api/admin/generic-pay-plans/versions/${draftVersion.id}/rules`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            organization_id: organizationId,
                            rule_kind: "percentage_of_eligible_sales",
                            rate_percent: Number(ratePercent),
                            display_name: `${ratePercent} % des ventes`,
                          }),
                        }
                      )
                    )
                  }
                >
                  Ajouter la règle pourcentage
                </button>
              </div>
            ) : null}
            {draftVersion && primaryRule ? (
              <>
                <PayPlanField label="Volume minimum">
                  <input
                    value={minimumVolume}
                    onChange={(e) => setMinimumVolume(e.target.value)}
                    inputMode="decimal"
                  />
                </PayPlanField>
                <div>
                  <button
                    type="button"
                    className="tagora-dark-outline-action"
                    disabled={
                      busy ||
                      conditions.some((c) => c.rule_module_id === primaryRule.id)
                    }
                    onClick={() =>
                      void run("Création de condition", () =>
                        commissionsFetch(
                          `/api/admin/generic-pay-plans/rules/${primaryRule.id}/conditions`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              organization_id: organizationId,
                              minimum_volume: Number(minimumVolume),
                            }),
                          }
                        )
                      )
                    }
                  >
                    Ajouter la condition
                  </button>
                </div>
                <PayPlanField label="Seuil de palier">
                  <input
                    value={tierThreshold}
                    onChange={(e) => setTierThreshold(e.target.value)}
                    inputMode="decimal"
                  />
                </PayPlanField>
                <div>
                  <button
                    type="button"
                    className="tagora-dark-outline-action"
                    disabled={
                      busy || tiers.some((t) => t.rule_module_id === primaryRule.id)
                    }
                    onClick={() =>
                      void run("Création de palier", () =>
                        commissionsFetch(
                          `/api/admin/generic-pay-plans/rules/${primaryRule.id}/tiers`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              organization_id: organizationId,
                              threshold_from: Number(tierThreshold),
                              rate_percent: Number(ratePercent),
                              tier_order: 0,
                            }),
                          }
                        )
                      )
                    }
                  >
                    Ajouter un palier
                  </button>
                </div>
              </>
            ) : null}
          </PayPlanFieldStack>
        </SectionCard>

        <SectionCard title="3. Affectation">
          {!activeVersion ? (
            <p className="ui-text-muted">
              Activez d’abord la version pour pouvoir affecter le plan.
            </p>
          ) : (
            <PayPlanFieldStack>
              {activeAssignment && activeAssignmentBeneficiary ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #dbe3ef",
                    background: "#f8fafc",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                  >
                    Affectation active
                  </span>
                  <strong style={{ fontSize: 17, color: "#0f172a" }}>
                    {activeAssignmentBeneficiary.primary}
                  </strong>
                  {activeAssignmentBeneficiary.secondary ? (
                    <span className="ui-text-muted">
                      {activeAssignmentBeneficiary.secondary}
                    </span>
                  ) : null}
                </div>
              ) : (
                <>
                  <PayPlanField label="Ajouter une affectation">
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                    >
                      <option value="">Sélectionner un représentant…</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.label}
                        </option>
                      ))}
                    </select>
                  </PayPlanField>
                  <div>
                    <button
                      type="button"
                      className="tagora-dark-action"
                      disabled={busy || !employeeId}
                      onClick={() =>
                        void run("Affectation", () =>
                          commissionsFetch(
                            "/api/admin/generic-pay-plans/assignments",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                organization_id: organizationId,
                                employee_id: Number(employeeId),
                                plan_version_id: activeVersion.id,
                                effective_from: effectiveFrom,
                                processing_frequency: "per_sale",
                              }),
                            }
                          )
                        )
                      }
                    >
                      Affecter le plan
                    </button>
                  </div>
                </>
              )}
            </PayPlanFieldStack>
          )}
        </SectionCard>

        <SectionCard id="traitement" title="4. Traiter une vente et vérifier">
          {!activeAssignment ? (
            <p className="ui-text-muted">
              Créez une affectation active pour lancer le calcul.
            </p>
          ) : (
            <PayPlanFieldStack>
              <PayPlanField label="Montant de vente">
                <input
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  inputMode="decimal"
                />
              </PayPlanField>
              <PayPlanDateField
                label="Date de vente"
                value={soldAt}
                onChange={setSoldAt}
              />
              <div>
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={busy}
                  onClick={() =>
                    void run("Traitement", async () => {
                      const res = await commissionsFetch(
                        "/api/admin/generic-pay-plans/process",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            organization_id: organizationId,
                            assignment_id: activeAssignment.id,
                            sale_amount: Number(saleAmount),
                            sold_at: soldAt,
                            external_reference_suffix: "ui",
                          }),
                        }
                      );
                      const json = (await res.json().catch(() => ({}))) as {
                        accrual_id?: string;
                        calculated_amount?: number;
                        status?: string;
                        employee_id?: number;
                      };
                      if (res.ok && json.accrual_id) {
                        setLastAccrualId(json.accrual_id);
                        const employee = employees.find(
                          (row) => row.id === Number(activeAssignment.employee_id)
                        );
                        const beneficiary = resolvePayPlanBeneficiaryDisplay({
                          employeeId: Number(activeAssignment.employee_id),
                          displayName: employee?.label || null,
                        });
                        writeRecentPayPlanResult({
                          accrualId: json.accrual_id,
                          organizationId,
                          templateId,
                          employeeId: beneficiary.employeeId,
                          beneficiaryPrimary: beneficiary.primary,
                          beneficiarySecondary: beneficiary.secondary,
                          planName: String(template.display_name),
                          versionLabel: activeVersion
                            ? `Version ${String(activeVersion.version_number)}`
                            : "—",
                          ruleName: primaryRule
                            ? String(primaryRule.display_name || "—")
                            : "—",
                          basisAmount: Number(saleAmount) || 0,
                          amount:
                            typeof json.calculated_amount === "number"
                              ? json.calculated_amount
                              : Number(saleAmount) * (Number(ratePercent) / 100),
                          status: String(json.status || "calculated"),
                          processedAt: new Date().toISOString(),
                        });
                      }
                      return res;
                    })
                  }
                >
                  Calculer la commission
                </button>
              </div>
              {resultAccrualId ? (
                <div>
                  <Link
                    href={`/admin/commissions/plans/results/${resultAccrualId}?organization_id=${encodeURIComponent(organizationId)}`}
                    className="tagora-dark-outline-action tagora-page-navigation-button"
                  >
                    Voir le résultat
                  </Link>
                </div>
              ) : null}
            </PayPlanFieldStack>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
