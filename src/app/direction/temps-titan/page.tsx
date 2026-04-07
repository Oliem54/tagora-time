"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type PaymentStatus = "paye" | "non_paye" | "";

type Employe = {
  id: string | number;
  nom: string;
  taux_base_titan: number | null;
};

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
  taux_total_h: number | null;
  total_salaire: number | null;
  total_benefice: number | null;
  total_titan: number | null;
  created_at: string | null;
};

type SortieTitanRow = {
  id: string | number;
  chauffeur_id: string | number | null;
  livraison_id: string | number | null;
  date_sortie: string | null;
  temps_total: string | null;
  refacturer_a_titan: boolean | null;
};

type UnifiedRow = {
  source: "manuel" | "sortie";
  sourceId: string;
  id: string | number;
  employe_id: string | number | null;
  employe_nom: string;
  date_travail: string;
  heure_debut: string;
  heure_fin: string;
  duree_totale: string;
  duree_heures: number;
  type_travail: string;
  livraison: string;
  notes: string | null;
  refacturee_a_titan: boolean;
  statut_paiement_titan: PaymentStatus;
  reference_facture_titan: string | null;
  date_facture_titan: string | null;
  taux_salaire_h: number;
  marge_h: number;
  taux_total_h: number;
  total_salaire: number;
  total_benefice: number;
  total_titan: number;
};

type FormState = {
  employe_id: string;
  date_travail: string;
  heure_debut: string;
  heure_fin: string;
  type_travail: string;
  notes: string;
  ajoute_manuellement: boolean;
};

const initialForm = (): FormState => ({
  employe_id: "",
  date_travail: todayIso(),
  heure_debut: "",
  heure_fin: "",
  type_travail: "entrepot",
  notes: "",
  ajoute_manuellement: true,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
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

function formatHours(value: number) {
  return `${value.toFixed(2)} h`;
}

function diffHours(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const diff = endMinutes - startMinutes;
  return diff > 0 ? diff / 60 : 0;
}

function hoursToText(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function parseHoursFromText(value: string | null | undefined) {
  if (!value) return 0;
  const text = String(value).trim();

  const hourMinuteMatch = text.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hourMinuteMatch) {
    const h = Number(hourMinuteMatch[1]);
    const m = Number(hourMinuteMatch[2]);
    return h + m / 60;
  }

  const hourOnlyMatch = text.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  if (hourOnlyMatch) {
    return Number(hourOnlyMatch[1].replace(",", "."));
  }

  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;

  return 0;
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  if (value === "paye") return "paye";
  if (value === "non_paye") return "non_paye";
  return "";
}

function badgeClasses(kind: "yes" | "no" | "paid" | "unpaid" | "neutral") {
  if (kind === "yes") return "bg-blue-50 text-blue-700 border-blue-200";
  if (kind === "no") return "bg-slate-50 text-slate-600 border-slate-200";
  if (kind === "paid") return "bg-green-50 text-green-700 border-green-200";
  if (kind === "unpaid") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-500 border-slate-200";
}

export default function TempsTitanPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(true);

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [tempsTitan, setTempsTitan] = useState<TempsTitanDbRow[]>([]);
  const [sortiesTitan, setSortiesTitan] = useState<SortieTitanRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [form, setForm] = useState<FormState>(initialForm());
  const [dateDebut, setDateDebut] = useState(firstDayOfMonthIso());
  const [dateFin, setDateFin] = useState(todayIso());

  const [tableFilter, setTableFilter] = useState<
    "toutes" | "facturables" | "refacturees" | "payees" | "non_payees"
  >("toutes");

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/direction/login");
        return;
      }
      setEmail(data.user.email || "");
      setAuthLoading(false);
    };
    checkSession();
  }, [router]);

  const clearMessages = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const loadEmployes = useCallback(async () => {
    const res = await supabase
      .from("chauffeurs")
      .select("id, nom, taux_base_titan")
      .order("id", { ascending: true });

    if (res.error) throw res.error;

    setEmployes(
      (res.data ?? []).map((row: any) => ({
        id: row.id,
        nom: row.nom ?? "",
        taux_base_titan:
          row.taux_base_titan !== null && row.taux_base_titan !== undefined
            ? Number(row.taux_base_titan)
            : null,
      }))
    );
  }, []);

  const loadTempsTitan = useCallback(async () => {
    const res = await supabase
      .from("temps_titan")
      .select("*")
      .order("date_travail", { ascending: false })
      .order("created_at", { ascending: false });

    if (res.error) throw res.error;

    setTempsTitan(
      (res.data ?? []).map((row: any) => ({
        id: row.id,
        employe_id: row.employe_id,
        employe_nom: row.employe_nom,
        date_travail: row.date_travail,
        heure_debut: row.heure_debut,
        heure_fin: row.heure_fin,
        duree_totale: toNumber(row.duree_totale ?? diffHours(row.heure_debut, row.heure_fin)),
        duree_heures: toNumber(row.duree_heures ?? diffHours(row.heure_debut, row.heure_fin)),
        type_travail: row.type_travail,
        notes: row.notes ?? null,
        ajoute_manuellement: !!row.ajoute_manuellement,
        cree_par_direction: !!row.cree_par_direction,
        refacturee_a_titan: !!row.refacturee_a_titan,
        statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
        reference_facture_titan: row.reference_facture_titan ?? null,
        date_facture_titan: row.date_facture_titan ?? null,
        taux_salaire_h: toNumber(row.taux_salaire_h),
        marge_h: toNumber(row.marge_h),
        total_salaire: toNumber(row.total_salaire),
        total_benefice: toNumber(row.total_benefice),
        total_titan: toNumber(row.total_titan),
        created_at: row.created_at ?? null
      }))
    );
  }, []);

  const loadSortiesTitan = useCallback(async () => {
    const res = await supabase
      .from("sorties_terrain")
      .select("id, chauffeur_id, livraison_id, date_sortie, temps_total, refacturer_a_titan")
      .eq("refacturer_a_titan", true)
      .order("date_sortie", { ascending: false });

    if (res.error) {
      setSortiesTitan([]);
      return;
    }

    setSortiesTitan((res.data ?? []) as SortieTitanRow[]);
  }, []);

  const loadAll = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        clearMessages();
        await Promise.all([loadEmployes(), loadTempsTitan(), loadSortiesTitan()]);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadEmployes, loadTempsTitan, loadSortiesTitan]
  );

  useEffect(() => {
    if (!authLoading) loadAll();
  }, [authLoading, loadAll]);

  const employeSelection = useMemo(() => {
    return employes.find((item) => String(item.id) === String(form.employe_id));
  }, [employes, form.employe_id]);

  const dureeCalculee = useMemo(() => {
    return diffHours(form.heure_debut, form.heure_fin);
  }, [form.heure_debut, form.heure_fin]);

  const tauxBaseTitan = employeSelection?.taux_base_titan ?? 0;
  const margeTitan = tauxBaseTitan * 0.15;
  const tauxTotalTitan = tauxBaseTitan + margeTitan;
  const totalSalaireCalcule = dureeCalculee * tauxBaseTitan;
  const totalBeneficeCalcule = dureeCalculee * margeTitan;
  const totalTitanCalcule = dureeCalculee * tauxTotalTitan;

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const employeMap = new Map(employes.map((e) => [String(e.id), e]));

    const manualRows: UnifiedRow[] = tempsTitan.map((row) => ({
      source: "manuel",
      sourceId: `manuel-${row.id}`,
      id: row.id,
      employe_id: row.employe_id ?? null,
      employe_nom: row.employe_nom ?? "-",
      date_travail: row.date_travail ?? "",
      heure_debut: row.heure_debut ?? "",
      heure_fin: row.heure_fin ?? "",
      duree_totale:
        typeof row.duree_totale === "string"
          ? row.duree_totale
          : hoursToText(toNumber(row.duree_heures ?? row.duree_totale)),
      duree_heures: toNumber(row.duree_heures ?? row.duree_totale),
      type_travail: row.type_travail ?? "",
      livraison: row.livraison ?? "-",
      notes: row.notes ?? null,
      refacturee_a_titan: !!row.refacturee_a_titan,
      statut_paiement_titan: normalizePaymentStatus(row.statut_paiement_titan),
      reference_facture_titan: row.reference_facture_titan ?? null,
      date_facture_titan: row.date_facture_titan ?? null,
      taux_salaire_h: toNumber(row.taux_salaire_h),
      marge_h: toNumber(row.marge_h),
      taux_total_h: toNumber(row.taux_total_h),
      total_salaire: toNumber(row.total_salaire),
      total_benefice: toNumber(row.total_benefice),
      total_titan: toNumber(row.total_titan),
    }));

    const sortieRows: UnifiedRow[] = sortiesTitan.map((row) => {
      const employe = row.chauffeur_id ? employeMap.get(String(row.chauffeur_id)) : undefined;
      const tauxBase = toNumber(employe?.taux_base_titan);
      const marge = tauxBase * 0.15;
      const tauxTotal = tauxBase + marge;
      const dureeHeures = parseHoursFromText(row.temps_total);
      return {
        source: "sortie",
        sourceId: `sortie-${row.id}`,
        id: row.id,
        employe_id: row.chauffeur_id ?? null,
        employe_nom: employe?.nom ?? "-",
        date_travail: row.date_sortie ?? "",
        heure_debut: "",
        heure_fin: "",
        duree_totale: row.temps_total ?? hoursToText(dureeHeures),
        duree_heures: dureeHeures,
        type_travail: "livraison",
        livraison: row.livraison_id ? `Livraison #${row.livraison_id}` : "-",
        notes: null,
        refacturee_a_titan: true,
        statut_paiement_titan: "",
        reference_facture_titan: null,
        date_facture_titan: null,
        taux_salaire_h: tauxBase,
        marge_h: marge,
        taux_total_h: tauxTotal,
        total_salaire: dureeHeures * tauxBase,
        total_benefice: dureeHeures * marge,
        total_titan: dureeHeures * tauxTotal,
      };
    });

    return [...manualRows, ...sortieRows].sort((a, b) => {
      const da = a.date_travail || "";
      const db = b.date_travail || "";
      return db.localeCompare(da);
    });
  }, [tempsTitan, sortiesTitan, employes]);

  const rowsInPeriod = useMemo(() => {
    return unifiedRows.filter((row) => {
      return (!dateDebut || row.date_travail >= dateDebut) && (!dateFin || row.date_travail <= dateFin);
    });
  }, [unifiedRows, dateDebut, dateFin]);

  const filteredRows = useMemo(() => {
    switch (tableFilter) {
      case "facturables":
        return rowsInPeriod.filter((row) => !row.refacturee_a_titan);
      case "refacturees":
        return rowsInPeriod.filter((row) => row.refacturee_a_titan);
      case "payees":
        return rowsInPeriod.filter((row) => row.statut_paiement_titan === "paye");
      case "non_payees":
        return rowsInPeriod.filter((row) => row.statut_paiement_titan === "non_paye");
      default:
        return rowsInPeriod;
    }
  }, [rowsInPeriod, tableFilter]);

  const totals = useMemo(() => {
    const totalHeuresTitan = rowsInPeriod.reduce((sum, row) => sum + row.duree_heures, 0);
    const totalSalaire = rowsInPeriod.reduce((sum, row) => sum + row.total_salaire, 0);
    const totalBenefice = rowsInPeriod.reduce((sum, row) => sum + row.total_benefice, 0);
    const totalTitan = rowsInPeriod.reduce((sum, row) => sum + row.total_titan, 0);
    const totalSortiesTitan = rowsInPeriod
      .filter((row) => row.source === "sortie")
      .reduce((sum, row) => sum + row.total_titan, 0);
    const totalTitanRefacture = rowsInPeriod
      .filter((row) => row.refacturee_a_titan)
      .reduce((sum, row) => sum + row.total_titan, 0);
    const totalPaye = rowsInPeriod
      .filter((row) => row.statut_paiement_titan === "paye")
      .reduce((sum, row) => sum + row.total_titan, 0);
    const totalNonPaye = rowsInPeriod
      .filter((row) => row.statut_paiement_titan !== "paye")
      .reduce((sum, row) => sum + row.total_titan, 0);

    return {
      totalHeuresTitan,
      totalSalaire,
      totalBenefice,
      totalTitan,
      totalSortiesTitan,
      totalTitanRefacture,
      totalPaye,
      totalNonPaye,
    };
  }, [rowsInPeriod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!form.employe_id) {
      setErrorMessage("Choisis un employé.");
      return;
    }

    if (!form.date_travail) {
      setErrorMessage("Choisis une date.");
      return;
    }

    if (!form.heure_debut || !form.heure_fin) {
      setErrorMessage("Entre l'heure début et l'heure fin.");
      return;
    }

    if (dureeCalculee <= 0) {
      setErrorMessage("La durée calculée doit être supérieure à 0.");
      return;
    }

    if (!employeSelection || employeSelection.taux_base_titan === null || employeSelection.taux_base_titan === undefined) {
      setErrorMessage("Taux de base Titan manquant dans la fiche employé.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        employe_id: form.employe_id,
        employe_nom: employeSelection.nom,
        date_travail: form.date_travail,
        heure_debut: form.heure_debut,
        heure_fin: form.heure_fin,
        duree_totale: hoursToText(dureeCalculee),
        duree_heures: dureeCalculee,
        type_travail: form.type_travail,
        livraison: null,
        notes: form.notes || null,
        ajoute_manuellement: form.ajoute_manuellement,
        cree_par_direction: true,
        refacturee_a_titan: false,
        statut_paiement_titan: null,
        reference_facture_titan: null,
        date_facture_titan: null,
        taux_salaire_h: tauxBaseTitan,
        marge_h: margeTitan,
        taux_total_h: tauxTotalTitan,
        total_salaire: totalSalaireCalcule,
        total_benefice: totalBeneficeCalcule,
        total_titan: totalTitanCalcule,
      };

      const { error } = await supabase.from("temps_titan").insert(payload);
      if (error) throw error;

      setSuccessMessage("Entrée Titan ajoutée.");
      setForm(initialForm());
      await loadAll(true);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: UnifiedRow) {
    if (row.source !== "manuel") {
      setErrorMessage("Les lignes provenant des sorties terrain sont en lecture seule.");
      return;
    }

    const ok = window.confirm("Supprimer cette entrée Titan ?");
    if (!ok) return;

    try {
      clearMessages();
      const { error } = await supabase.from("temps_titan").delete().eq("id", row.id);
      if (error) throw error;
      setSuccessMessage("Entrée supprimée.");
      await loadAll(true);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur lors de la suppression.");
    }
  }

  if (authLoading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1680px] px-3 py-4">
        <div className="rounded-[26px] bg-[#214f7d] p-10 shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex flex-col items-center justify-center leading-none">
                <Image src="/logo.png" alt="Logo Time" width={170} height={170} priority />
                <div className="-mt-14 text-center text-[32px] font-bold leading-none text-white">
                  Time
                </div>
              </div>
              <div className="text-white">
                <div className="text-[28px] font-bold leading-tight">Temps Titan</div>
                <div className="mt-2 text-sm text-white/90">
                  Suivi du temps, de la facturation et de la refacturation Titan
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">
              {email ? `Connecté comme : ${email}` : "Module direction"}
            </div>
          </div>
        </div>

        {(errorMessage || successMessage) && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              errorMessage
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {errorMessage || successMessage}
          </div>
        )}

        <div className="mt-4 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Sommaire Temps Titan</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vue consolidée des performances, facturation et refacturation Titan sur la période.
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
            <StatCard label="Total Titan facturable" value={formatMoney(totals.totalTitan)} icon="🧾" highlight />
            <StatCard label="Total km terrain" value="0 km" icon="🚚" />
            <StatCard label="Total sorties / livraisons Titan" value={formatMoney(totals.totalSortiesTitan)} icon="🚛" />
            <StatCard label="Total Titan refacturé" value={formatMoney(totals.totalTitanRefacture)} icon="🔁" />
            <StatCard label="Total payé" value={formatMoney(totals.totalPaye)} icon="✅" success />
            <StatCard label="Total non payé" value={formatMoney(totals.totalNonPaye)} icon="⚠️" warning />
            <StatCard label="Total global Titan" value={formatMoney(totals.totalTitan)} icon="🧮" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Ajouter une entrée Titan</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Crée une nouvelle ligne de temps pour la refacturation Titan.
                </p>
              </div>
              <div className="inline-flex items-center rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
                <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  ⌛
                </span>
                Temps réel
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm text-slate-600">
                Employé
                <select
                  value={form.employe_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, employe_id: e.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300"
                >
                  <option value="">Choisir un employé</option>
                  {employes.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {item.nom}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-600">
                Date de travail
                <input
                  type="date"
                  value={form.date_travail}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, date_travail: e.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-slate-600">
                  Heure début
                  <input
                    type="time"
                    value={form.heure_debut}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, heure_debut: e.target.value }))
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Heure fin
                  <input
                    type="time"
                    value={form.heure_fin}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, heure_fin: e.target.value }))
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-300"
                  />
                </label>
              </div>

              <label className="block text-sm text-slate-600">
                Type de travail
                <select
                  value={form.type_travail}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, type_travail: e.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300"
                >
                  <option value="entrepot">entrepôt</option>
                  <option value="manutention">manutention</option>
                  <option value="chargement">chargement</option>
                  <option value="dechargement">déchargement</option>
                  <option value="assemblage">assemblage</option>
                  <option value="autre">autre</option>
                </select>
              </label>

              <div className="grid grid-cols-1 gap-2">
                <div className="text-sm text-slate-600">Salaire horaire de base</div>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  {employeSelection
                    ? employeSelection.taux_base_titan !== null && employeSelection.taux_base_titan !== undefined
                      ? formatMoney(employeSelection.taux_base_titan)
                      : "Taux de base Titan manquant dans la fiche employé."
                    : "-"}
                </div>

                <div className="mt-2 text-sm text-slate-600">Bénéfice marginal 15 %</div>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  {employeSelection && employeSelection.taux_base_titan !== null && employeSelection.taux_base_titan !== undefined
                    ? formatMoney(margeTitan)
                    : "-"}
                </div>

                <div className="mt-2 text-sm text-slate-600">Taux total Titan</div>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  {employeSelection && employeSelection.taux_base_titan !== null && employeSelection.taux_base_titan !== undefined
                    ? formatMoney(tauxTotalTitan)
                    : "-"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Durée calculée</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">
                    {hoursToText(dureeCalculee)}
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-blue-500">Montant salaire</div>
                  <div className="mt-2 text-lg font-semibold text-blue-900">
                    {formatMoney(totalSalaireCalcule)}
                  </div>
                </div>
                <div className="rounded-2xl border border-green-200 bg-green-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-green-500">Montant bénéfice</div>
                  <div className="mt-2 text-lg font-semibold text-green-900">
                    {formatMoney(totalBeneficeCalcule)}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-amber-500">Montant total Titan</div>
                  <div className="mt-2 text-lg font-semibold text-amber-900">
                    {formatMoney(totalTitanCalcule)}
                  </div>
                </div>
              </div>

              <label className="block text-sm text-slate-600">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="mt-1 min-h-[110px] w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-slate-300"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.ajoute_manuellement}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ajoute_manuellement: e.target.checked }))
                  }
                />
                Ajouté manuellement
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Ajouter"}
              </button>
            </form>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Liste du temps Titan</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Filtrer et suivre les entrées Titan en temps réel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadAll(true)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                {refreshing ? "Actualisation..." : "Actualiser"}
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { key: "toutes", label: "Toutes" },
                { key: "facturables", label: "Facturables" },
                { key: "refacturees", label: "Refacturées" },
                { key: "non_payees", label: "Non payées" },
                { key: "payees", label: "Payées" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTableFilter(item.key as typeof tableFilter)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    tableFilter === item.key
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1500px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Source</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">ID</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Date</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Employé / Chauffeur</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Type</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Durée</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Livraison</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Salaire/h</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Marge 15%</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Taux total</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total salaire</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total bénéfice</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Total Titan</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Refacturé</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Statut paiement</th>
                    <th className="px-4 py-4 text-left font-medium uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-8 text-slate-500" colSpan={16}>
                        Chargement...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-slate-500" colSpan={16}>
                        Aucune donnée sur la période.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.sourceId} className="bg-white">
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                              row.source === "manuel"
                                ? badgeClasses("yes")
                                : badgeClasses("neutral")
                            }`}
                          >
                            {row.source === "manuel" ? "Manuel" : "Livraison"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{row.sourceId}</td>
                        <td className="px-4 py-4 text-slate-700">{row.date_travail || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{row.employe_nom || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{row.type_travail || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{row.duree_totale || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{row.livraison || "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(row.taux_salaire_h)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(row.marge_h)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(row.taux_total_h)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(row.total_salaire)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(row.total_benefice)}</td>
                        <td className="px-4 py-4 font-semibold text-slate-900">{formatMoney(row.total_titan)}</td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                              row.refacturee_a_titan ? badgeClasses("yes") : badgeClasses("no")
                            }`}
                          >
                            {row.refacturee_a_titan ? "Oui" : "Non"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                              row.statut_paiement_titan === "paye"
                                ? badgeClasses("paid")
                                : row.statut_paiement_titan === "non_paye"
                                ? badgeClasses("unpaid")
                                : badgeClasses("neutral")
                            }`}
                          >
                            {row.statut_paiement_titan === "paye"
                              ? "Payé"
                              : row.statut_paiement_titan === "non_paye"
                              ? "Non payé"
                              : "-"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {row.source === "manuel" ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm text-red-700 hover:bg-red-100"
                            >
                              Supprimer
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Lecture seule</span>
                          )}
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
    </div>
  );
}

function StatCard({
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