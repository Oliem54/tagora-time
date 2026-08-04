"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";

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

  const reload = useCallback(async () => {
    if (!organizationId) {
      setError("Organisation manquante.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [detailRes, employeesRes] = await Promise.all([
      commissionsFetch(
        `/api/admin/generic-pay-plans/${templateId}?organization_id=${encodeURIComponent(organizationId)}`
      ),
      commissionsFetch(
        `/api/admin/generic-pay-plans/employees?organization_id=${encodeURIComponent(organizationId)}`
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
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error || "Plan introuvable."}
        </p>
        <Link href="/admin/commissions/plans">Retour à la liste</Link>
      </main>
    );
  }

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        title={String(template.display_name)}
        subtitle={`${String(template.template_code)} · ${String(template.status)}`}
        navigation={<AdminCommissionsNavigation variant="commissions" />}
      />

      <div className="ui-stack" style={{ marginTop: 20, gap: 16 }}>
        <p>
          <Link
            href={`/admin/commissions/plans?organization_id=${encodeURIComponent(organizationId)}`}
          >
            ← Tous les plans
          </Link>
        </p>

        {error ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" style={{ color: "#166534" }}>
            {success}
          </p>
        ) : null}

        <SectionCard title="1. Version">
          {workingVersion ? (
            <p>
              Version v{String(workingVersion.version_number)} ·{" "}
              <strong>{String(workingVersion.status)}</strong>
            </p>
          ) : (
            <p className="ui-text-muted">Aucune version. Créez un brouillon.</p>
          )}
          <div className="ui-stack" style={{ gap: 10, maxWidth: 420, marginTop: 12 }}>
            <label className="ui-stack-xs">
              <span>Date d’effet</span>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </label>
            {!draftVersion ? (
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
            ) : (
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
            )}
          </div>
        </SectionCard>

        <SectionCard title="2. Règle et condition / palier">
          {primaryRule ? (
            <p>
              Règle : <strong>{String(primaryRule.display_name)}</strong> (
              {String(primaryRule.rule_kind)})
            </p>
          ) : (
            <p className="ui-text-muted">Aucune règle sur la version courante.</p>
          )}
          <div className="ui-stack" style={{ gap: 10, maxWidth: 420, marginTop: 12 }}>
            <label className="ui-stack-xs">
              <span>Pourcentage</span>
              <input
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
                inputMode="decimal"
              />
            </label>
            {draftVersion && !primaryRule ? (
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
            ) : null}
            {draftVersion && primaryRule ? (
              <>
                <label className="ui-stack-xs">
                  <span>Volume minimum</span>
                  <input
                    value={minimumVolume}
                    onChange={(e) => setMinimumVolume(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  disabled={busy || conditions.some((c) => c.rule_module_id === primaryRule.id)}
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
                <label className="ui-stack-xs">
                  <span>Seuil de palier</span>
                  <input
                    value={tierThreshold}
                    onChange={(e) => setTierThreshold(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <button
                  type="button"
                  className="tagora-dark-outline-action"
                  disabled={busy || tiers.some((t) => t.rule_module_id === primaryRule.id)}
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
              </>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="3. Affectation">
          {!activeVersion ? (
            <p className="ui-text-muted">
              Activez d’abord la version pour pouvoir affecter le plan.
            </p>
          ) : (
            <div className="ui-stack" style={{ gap: 10, maxWidth: 420 }}>
              <label className="ui-stack-xs">
                <span>Représentant</span>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeAssignment ? (
                <p>
                  Affectation active : employé #{String(activeAssignment.employee_id)}
                </p>
              ) : (
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={busy || !employeeId}
                  onClick={() =>
                    void run("Affectation", () =>
                      commissionsFetch("/api/admin/generic-pay-plans/assignments", {
                        method: "POST",
                        body: JSON.stringify({
                          organization_id: organizationId,
                          employee_id: Number(employeeId),
                          plan_version_id: activeVersion.id,
                          effective_from: effectiveFrom,
                          processing_frequency: "per_sale",
                        }),
                      })
                    )
                  }
                >
                  Affecter le plan
                </button>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="4. Traiter une vente et vérifier">
          {!activeAssignment ? (
            <p className="ui-text-muted">
              Créez une affectation active pour lancer le calcul.
            </p>
          ) : (
            <div className="ui-stack" style={{ gap: 10, maxWidth: 420 }}>
              <label className="ui-stack-xs">
                <span>Montant de vente</span>
                <input
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="ui-stack-xs">
                <span>Date de vente</span>
                <input
                  type="date"
                  value={soldAt}
                  onChange={(e) => setSoldAt(e.target.value)}
                />
              </label>
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
                    };
                    if (res.ok && json.accrual_id) {
                      setLastAccrualId(json.accrual_id);
                    }
                    return res;
                  })
                }
              >
                Calculer la commission
              </button>
              {lastAccrualId ? (
                <Link
                  href={`/admin/commissions/plans/results/${lastAccrualId}?organization_id=${encodeURIComponent(organizationId)}`}
                  className="tagora-dark-outline-action tagora-page-navigation-button"
                >
                  Ouvrir le résultat
                </Link>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
