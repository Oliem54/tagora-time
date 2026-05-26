"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { supabase } from "@/app/lib/supabase/client";

type DirectionObjectiveOperationalRow = {
  id: string;
  title: string;
  description: string | null;
  team_name: string | null;
  chauffeur_id: number | null;
  period_start: string;
  period_end: string;
  target_type: string;
  target_sales_count: number | null;
  achieved_sales_count: number;
  status: string;
  entries_count: number;
  entries_pending_validation: number;
  entries_paid: number;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(value: string | null) {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "Actif";
    case "achieved":
      return "Atteint";
    case "partially_achieved":
      return "Partiel";
    case "behind":
      return "En retard";
    case "cancelled":
      return "Annule";
    default:
      return "Brouillon";
  }
}

export default function DirectionCommissionsPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseCommissions = hasPermission("commissions");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState<DirectionObjectiveOperationalRow[]>([]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("direction_objectives_operational_view")
      .select(
        "id, title, description, team_name, chauffeur_id, period_start, period_end, target_type, target_sales_count, achieved_sales_count, status, entries_count, entries_pending_validation, entries_paid"
      )
      .order("period_end", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setRows([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setRows(
      (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        description: typeof row.description === "string" ? row.description : null,
        team_name: typeof row.team_name === "string" ? row.team_name : null,
        chauffeur_id:
          typeof row.chauffeur_id === "number" ? row.chauffeur_id : toNumber(row.chauffeur_id),
        period_start: String(row.period_start ?? ""),
        period_end: String(row.period_end ?? ""),
        target_type: String(row.target_type ?? ""),
        target_sales_count:
          row.target_sales_count == null ? null : Math.trunc(toNumber(row.target_sales_count)),
        achieved_sales_count: Math.trunc(toNumber(row.achieved_sales_count)),
        status: String(row.status ?? "draft"),
        entries_count: Math.trunc(toNumber(row.entries_count)),
        entries_pending_validation: Math.trunc(toNumber(row.entries_pending_validation)),
        entries_paid: Math.trunc(toNumber(row.entries_paid)),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || !canUseCommissions) return;
    void loadRows();
  }, [accessLoading, canUseCommissions, loadRows, user]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "active" || row.status === "partially_achieved") acc.active += 1;
        if (row.status === "achieved") acc.achieved += 1;
        if (row.status === "behind") acc.behind += 1;
        acc.pendingValidation += row.entries_pending_validation;
        return acc;
      },
      { total: 0, active: 0, achieved: 0, behind: 0, pendingValidation: 0 }
    );
  }, [rows]);

  if (accessLoading || (!errorMessage && !canUseCommissions && !!user) || (canUseCommissions && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement des objectifs..." fullScreen />;
  }

  if (!user) {
    return (
      <div className="page-container">
        <AccessNotice title="Session requise" description="Connectez-vous pour continuer." />
      </div>
    );
  }

  if (!canUseCommissions) {
    return (
      <div className="page-container">
        <AccessNotice
          title="Acces refuse"
          description="La permission commissions est requise pour consulter les objectifs."
        />
      </div>
    );
  }

  return (
    <main className="page-container">
      <AuthenticatedPageHeader
        title="Commissions & objectifs"
        subtitle="Vue Direction operationnelle sans montants de commission."
      />

      {errorMessage ? (
        <div style={{ marginTop: 20 }}>
          <AccessNotice title="Chargement limite" description={errorMessage} />
        </div>
      ) : null}

      <SectionCard
        title="Indicateurs operationnels"
        subtitle="Suivi des objectifs et du workflow, sans donnees monetaires."
        className="ui-stack-sm"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <div className="tagora-panel-muted" style={{ padding: 12 }}>
            <div className="tagora-label">Objectifs</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{summary.total}</div>
          </div>
          <div className="tagora-panel-muted" style={{ padding: 12 }}>
            <div className="tagora-label">Actifs</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{summary.active}</div>
          </div>
          <div className="tagora-panel-muted" style={{ padding: 12 }}>
            <div className="tagora-label">Atteints</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{summary.achieved}</div>
          </div>
          <div className="tagora-panel-muted" style={{ padding: 12 }}>
            <div className="tagora-label">En retard</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{summary.behind}</div>
          </div>
          <div className="tagora-panel-muted" style={{ padding: 12 }}>
            <div className="tagora-label">Entrees a valider</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{summary.pendingValidation}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Objectifs"
        subtitle="Performance non monetaire pour pilotage operationnel."
        className="ui-stack-sm"
      >
        <div className="tagora-panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 12px" }}>Objectif</th>
                <th style={{ padding: "10px 12px" }}>Periode</th>
                <th style={{ padding: "10px 12px" }}>Type</th>
                <th style={{ padding: "10px 12px" }}>Cible (non monetaire)</th>
                <th style={{ padding: "10px 12px" }}>Realise</th>
                <th style={{ padding: "10px 12px" }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700 }}>{row.title}</div>
                    <div className="tagora-note" style={{ marginTop: 4 }}>
                      {row.team_name
                        ? `Equipe: ${row.team_name}`
                        : row.chauffeur_id
                          ? `Employe #${row.chauffeur_id}`
                          : "Affectation operationnelle"}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.period_start} - {row.period_end}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.target_type === "sales_count" ? "Volume" : "Objectif qualitatif"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.target_type === "sales_count" && row.target_sales_count != null
                      ? `${row.target_sales_count} ventes`
                      : "Reserve admin"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {row.target_type === "sales_count"
                      ? `${row.achieved_sales_count} ventes`
                      : "Suivi operationnel"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>{statusLabel(row.status)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "16px 12px", color: "#64748b" }}>
                    Aucun objectif disponible.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}
