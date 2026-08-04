"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import AdminCommissionsNavigation from "@/app/components/admin/AdminCommissionsNavigation";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";
import { resolveSingleMembershipOrganizationPreselect } from "@/app/lib/auth/organization-access.shared";
import { normalizePayPlanCode } from "@/app/lib/commissions/generic-pay-plan.shared";
import {
  PayPlanField,
  PayPlanFieldStack,
  PayPlanMetaLine,
  PayPlanStatusBadge,
} from "@/app/admin/commissions/plans/pay-plan-readability";

type OrganizationOption = { id: string; display_name: string };

type TemplateRow = {
  id: string;
  template_code: string;
  display_name: string;
  status: string;
  version_label: string;
  assignment_count: number;
};

export default function GenericPayPlansPageClient() {
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (orgId: string) => {
    if (!orgId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await commissionsFetch(
      `/api/admin/generic-pay-plans?organization_id=${encodeURIComponent(orgId)}`
    );
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      templates?: TemplateRow[];
    };
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Chargement impossible.");
      return;
    }
    setTemplates(json.templates || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgsRes = await commissionsFetch("/api/admin/commissions/organizations");
      const orgsJson = (await orgsRes.json().catch(() => ({}))) as {
        organizations?: OrganizationOption[];
        error?: string;
      };
      if (cancelled) return;
      if (!orgsRes.ok) {
        setError(orgsJson.error || "Organisations indisponibles.");
        setLoading(false);
        return;
      }
      const nextOrgs = orgsJson.organizations || [];
      setOrganizations(nextOrgs);
      const preselect = resolveSingleMembershipOrganizationPreselect(
        nextOrgs.map((org) => ({
          organizationId: org.id,
          displayName: org.display_name,
        }))
      );
      const initialOrg = preselect || nextOrgs[0]?.id || "";
      setOrganizationId(initialOrg);
      if (initialOrg) {
        await load(initialOrg);
      } else {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) {
      setError("Choisissez une organisation.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const normalized = normalizePayPlanCode(code);
    const res = await commissionsFetch("/api/admin/generic-pay-plans", {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        name,
        code: normalized || code,
        description: description || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      template?: { id: string };
    };
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Création impossible.");
      return;
    }
    setSuccess("Plan créé.");
    setName("");
    setCode("");
    setDescription("");
    await load(organizationId);
    if (json.template?.id) {
      window.location.href = `/admin/commissions/plans/${json.template.id}?organization_id=${encodeURIComponent(organizationId)}`;
    }
  }

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        title="Plans de rémunération"
        subtitle="Créez un modèle, configurez une version, affectez-la, puis calculez une commission."
        navigation={<AdminCommissionsNavigation variant="commissions" />}
      />

      <div className="ui-stack" style={{ marginTop: 20, gap: 24 }}>
        <SectionCard title="Organisation">
          <PayPlanField label="Organisation">
            <select
              value={organizationId}
              onChange={(e) => {
                const next = e.target.value;
                setOrganizationId(next);
                void load(next);
              }}
            >
              <option value="">Sélectionner…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.display_name}
                </option>
              ))}
            </select>
          </PayPlanField>
        </SectionCard>

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

        <SectionCard title="Nouveau plan">
          <form onSubmit={createPlan}>
            <PayPlanFieldStack>
              <PayPlanField label="Nom">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex. Plan ventes standard"
                  required
                />
              </PayPlanField>
              <PayPlanField label="Code">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ex. qa_6f_plan"
                  required
                />
              </PayPlanField>
              <PayPlanField label="Description (optionnel)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </PayPlanField>
              <div>
                <button
                  type="submit"
                  className="tagora-dark-action"
                  disabled={saving || !organizationId}
                >
                  {saving ? "Création…" : "Créer le plan"}
                </button>
              </div>
            </PayPlanFieldStack>
          </form>
        </SectionCard>

        <SectionCard title="Plans existants">
          {loading ? (
            <p className="ui-text-muted">Chargement…</p>
          ) : templates.length === 0 ? (
            <p className="ui-text-muted">
              Aucun plan pour cette organisation. Créez le premier ci-dessus.
            </p>
          ) : (
            <div className="ui-stack" style={{ gap: 14 }}>
              {templates.map((template) => (
                <AppCard key={template.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ display: "grid", gap: 12, flex: "1 1 240px" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: "#111827",
                          }}
                        >
                          {template.display_name}
                        </strong>
                        <PayPlanStatusBadge status={template.status} />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        }}
                      >
                        <PayPlanMetaLine label="Code" value={template.template_code} />
                        <PayPlanMetaLine label="Version" value={template.version_label} />
                        <PayPlanMetaLine
                          label="Affectations"
                          value={`${template.assignment_count}`}
                        />
                      </div>
                    </div>
                    <Link
                      href={`/admin/commissions/plans/${template.id}?organization_id=${encodeURIComponent(organizationId)}`}
                      className="tagora-dark-action tagora-page-navigation-button"
                    >
                      Ouvrir
                    </Link>
                  </div>
                </AppCard>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
