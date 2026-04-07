"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase/client";
import StatCard from "../temps-titan/page";

// Types

type PaymentStatus = "paye" | "non_paye" | "";

type TempsTitanDbRow = {
  id: string | number;
  employe_id: string | number | null;
  employe_nom: string | null;
  date_travail: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  duree_totale: string | number | null;
  duree_heures: number | null;
  type_travail: string | null;
  notes: string | null;
  ajoute_manuellement: boolean | null;
  cree_par_direction: boolean | null;
  refacturee_a_titan: boolean | null;
  statut_paiement_titan: string | null;
  reference_facture_titan: string | null;
  date_facture_titan: string | null;
  taux_salaire_h: number | null;
  marge_h: number | null;
  total_salaire: number | null;
  total_benefice: number | null;
  total_titan: number | null;
  created_at: string | null;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

      label,
      value,
      icon,
      highlight = false,
      success = false,
      warning = false,
    }: {
      label: string;
      value: string;
      icon: string;
      highlight?: boolean;
      success?: boolean;
      warning?: boolean;
    }) {
      let classes = "border-slate-200 bg-white";
      if (highlight) classes = "border-amber-200 bg-amber-50";
      if (success) classes = "border-green-200 bg-green-50";
      if (warning) classes = "border-amber-200 bg-amber-50";

      return (
        <div className={`rounded-[22px] border p-4 shadow-sm ${classes}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">{label}</div>
              <div className="mt-2 text-[18px] font-semibold text-slate-900">{value}</div>
            </div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg">
              {icon}
            </div>
          </div>
        </div>
      );
    }
        .order("date_travail", { ascending: false });
      if (error) throw error;
      setRows(
        (data ?? []).map((row: any) => ({
          ...row,
          duree_heures: toNumber(row.duree_heures ?? row.duree_totale),
          taux_salaire_h: toNumber(row.taux_salaire_h),
          marge_h: toNumber(row.marge_h),
          total_salaire: toNumber(row.total_salaire),
          total_benefice: toNumber(row.total_benefice),
          total_titan: toNumber(row.total_titan),
          statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
        }))
      );
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return (
        (!dateDebut || (row.date_travail && row.date_travail >= dateDebut)) &&
        (!dateFin || (row.date_travail && row.date_travail <= dateFin))
      );
    });
  }, [rows, dateDebut, dateFin]);

  const totals = useMemo(() => {
    const totalHeuresTitan = filteredRows.reduce((sum, row) => sum + (row.duree_heures || 0), 0);
    const totalSalaire = filteredRows.reduce((sum, row) => sum + (row.total_salaire || 0), 0);
    const totalBenefice = filteredRows.reduce((sum, row) => sum + (row.total_benefice || 0), 0);
    const totalTitan = filteredRows.reduce((sum, row) => sum + (row.total_titan || 0), 0);
    const totalSortiesTitan = 0; // Placeholder for future km Titan
    const totalPaye = filteredRows.filter((row) => row.statut_paiement_titan === "paye").reduce((sum, row) => sum + (row.total_titan || 0), 0);
    const totalNonPaye = filteredRows.filter((row) => row.statut_paiement_titan !== "paye").reduce((sum, row) => sum + (row.total_titan || 0), 0);
    return {
      totalHeuresTitan,
      totalSalaire,
      totalBenefice,
      totalTitan,
      totalSortiesTitan,
      totalPaye,
      totalNonPaye,
    };
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1680px] px-3 py-4">
        <div className="mb-6 rounded-[26px] bg-[#214f7d] p-10 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex flex-col items-center justify-center leading-none">
                <img src="/logo.png" alt="Logo Time" width={170} height={170} />
                <div className="-mt-14 text-center text-[32px] font-bold leading-none text-white">
                  Time
                </div>
              </div>
              <div className="text-white">
                <div className="text-[28px] font-bold leading-tight">Facturation Titan</div>
                <div className="mt-2 text-sm text-white/90">
                  Synthèse des éléments à facturer à Titan
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Synthèse facturation Titan</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vue consolidée des éléments à facturer à Titan sur la période.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Période</div>
              <div className="mt-2 flex gap-2">
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
            <StatCard label="Total heures Titan" value={formatHours(totals.totalHeuresTitan)} icon="⏱" />
            <StatCard label="Total salaire" value={formatMoney(totals.totalSalaire)} icon="💵" />
            <StatCard label="Total bénéfice" value={formatMoney(totals.totalBenefice)} icon="📈" />
            <StatCard label="Total Titan à facturer" value={formatMoney(totals.totalTitan)} icon="🧾" highlight />
            <StatCard label="Total sorties / livraisons Titan" value={formatMoney(totals.totalSortiesTitan)} icon="🚛" />
            <StatCard label="Total payé" value={formatMoney(totals.totalPaye)} icon="✅" success />
            <StatCard label="Total non payé" value={formatMoney(totals.totalNonPaye)} icon="⚠️" warning />
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Détail des entrées Titan</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1500px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">ID</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Date</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Employé</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Type</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Durée</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Salaire/h</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Marge 15%</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total salaire</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total bénéfice</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total Titan</th>
                  <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Statut paiement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={11}>
                      Chargement...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={11}>
                      Aucune donnée sur la période.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="bg-white">
                      <td className="px-4 py-4 text-slate-700">{row.id}</td>
                      <td className="px-4 py-4 text-slate-700">{row.date_travail || "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{row.employe_nom || "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{row.type_travail || "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{row.duree_heures ? formatHours(row.duree_heures) : "-"}</td>
                      <td className="px-4 py-4 text-slate-700">{formatMoney(row.taux_salaire_h ?? 0)}</td>
                      <td className="px-4 py-4 text-slate-700">{formatMoney(row.marge_h ?? 0)}</td>
                      <td className="px-4 py-4 text-slate-700">{formatMoney(row.total_salaire ?? 0)}</td>
                      <td className="px-4 py-4 text-slate-700">{formatMoney(row.total_benefice ?? 0)}</td>
                      <td className="px-4 py-4 font-semibold text-slate-900">{formatMoney(row.total_titan ?? 0)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                            row.statut_paiement_titan === "paye"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : row.statut_paiement_titan === "non_paye"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}
                        >
                          {row.statut_paiement_titan === "paye"
                            ? "Payé"
                            : row.statut_paiement_titan === "non_paye"
                            ? "Non payé"
                            : "-"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
// Duplicate StatCard removed. Only one definition remains.
