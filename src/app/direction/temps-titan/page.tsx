"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AccessNotice from "@/app/components/AccessNotice";
import DirectionFinanceRestrictedScreen from "@/app/components/direction/DirectionFinanceRestrictedScreen";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

function firstDayOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

export default function DirectionTempsTitanOperationalPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [totalHours, setTotalHours] = useState(0);
  const [entryCount, setEntryCount] = useState(0);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const blocked = !accessLoading && !!user && !hasPermission("terrain");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const { data, error, count } = await supabase
      .from("direction_temps_titan_operational")
      .select("duree_heures", { count: "exact" })
      .gte("date_travail", dateFrom)
      .lte("date_travail", dateTo);

    if (error) {
      setTotalHours(0);
      setEntryCount(0);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const hours = (data ?? []).reduce((sum, row) => sum + toNumber(row.duree_heures), 0);
    setTotalHours(hours);
    setEntryCount(count ?? data?.length ?? 0);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (blocked || accessLoading) return;
    void loadSummary();
  }, [accessLoading, blocked, loadSummary]);

  const periodLabel = useMemo(() => `${dateFrom} → ${dateTo}`, [dateFrom, dateTo]);

  if (accessLoading || (!blocked && loading)) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Suivi des heures — vue Direction"
        adminHref="/admin/temps-titan-finance"
      >
        <AccessNotice description="Chargement du resume operationnel..." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  if (blocked) {
    return (
      <DirectionFinanceRestrictedScreen
        title="Suivi des heures — vue Direction"
        adminHref="/admin/temps-titan-finance"
      >
        <AccessNotice description="La permission terrain est requise." />
      </DirectionFinanceRestrictedScreen>
    );
  }

  return (
    <DirectionFinanceRestrictedScreen
      title="Suivi des heures — vue Direction"
      adminHref="/admin/temps-titan-finance"
      operationalTitle="Resume operationnel (heures et volumes uniquement)"
    >
      {errorMessage ? (
        <AccessNotice title="Chargement limite" description={errorMessage} />
      ) : (
        <div className="ui-stack-md">
          <div className="tagora-panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
              <label className="tagora-field">
                <span className="tagora-label">Du</span>
                <input
                  type="date"
                  className="tagora-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="tagora-field">
                <span className="tagora-label">Au</span>
                <input
                  type="date"
                  className="tagora-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="tagora-dark-outline-action"
                onClick={() => void loadSummary()}
              >
                Actualiser
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            <div className="tagora-panel-muted" style={{ padding: 16 }}>
              <div className="tagora-label">Periode</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>{periodLabel}</div>
            </div>
            <div className="tagora-panel-muted" style={{ padding: 16 }}>
              <div className="tagora-label">Entrees temps</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>{entryCount}</div>
            </div>
            <div className="tagora-panel-muted" style={{ padding: 16 }}>
              <div className="tagora-label">Heures totales</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>
                {formatHours(totalHours)}
              </div>
            </div>
          </div>

          <div className="tagora-panel" style={{ padding: 16 }}>
            <p style={{ margin: 0, lineHeight: 1.55, color: "#334155" }}>
              Pour le detail des punchs, corrections et registre horaire, utilisez l&apos;horodateur
              direction. Les couts salariaux, taux et refacturation intercompagnies sont dans Admin
              (donnees financieres reservees a l administration).
            </p>
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link href="/direction/horodateur/registre" className="tagora-dark-action">
                Registre des heures
              </Link>
              <Link href="/direction/horodateur" className="tagora-dark-outline-action">
                Horodateur live
              </Link>
            </div>
          </div>
        </div>
      )}
    </DirectionFinanceRestrictedScreen>
  );
}
