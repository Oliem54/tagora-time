import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type TitanBillingChauffeur = {
  id: string | number;
  nom?: string | null;
  primary_company?: AccountRequestCompany | null;
  titan_enabled?: boolean | null;
  titan_mode_timeclock?: boolean | null;
  titan_mode_sorties?: boolean | null;
  titan_hourly_rate?: number | null;
  taux_base_titan?: number | null;
  social_benefits_percent?: number | null;
  titan_billable?: boolean | null;
  can_work_for_titan_produits_industriels?: boolean | null;
};

export type TitanTempsRow = {
  id: string | number;
  employe_id: string | number | null;
  employe_nom?: string | null;
  date_travail?: string | null;
  duree_heures?: number | null;
  payable_minutes?: number | null;
  facturable_minutes?: number | null;
  temps_presence?: string | null;
  temps_payable?: string | null;
  temps_non_payable?: string | null;
  type_travail?: string | null;
  livraison?: string | null;
  statut_paiement_titan?: string | null;
  company_context?: AccountRequestCompany | null;
};

export type TitanSortieRow = {
  id: string | number;
  chauffeur_id: string | number | null;
  livraison_id?: string | number | null;
  date_sortie?: string | null;
  temps_total?: string | null;
  payable_minutes?: number | null;
  facturable_minutes?: number | null;
  temps_payable?: string | null;
  temps_non_payable?: string | null;
  company_context?: AccountRequestCompany | null;
};

export type TitanBillingRow = {
  source: "timeclock" | "sortie";
  source_id: string;
  id: string | number;
  employe_id: string | number | null;
  employe_nom: string;
  date_travail: string;
  company_context: AccountRequestCompany | null;
  type_travail: string;
  livraison: string;
  presence_text: string;
  payable_text: string;
  non_payable_text: string;
  titan_hours: number;
  taux_horaire: number;
  social_benefits_percent: number;
  total_salaire: number;
  total_benefice: number;
  total_titan: number;
  statut_paiement_titan: string;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDurationHours(value: string | null | undefined) {
  if (!value) return 0;

  const hourMinuteMatch = value.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hourMinuteMatch) {
    return Number(hourMinuteMatch[1]) + Number(hourMinuteMatch[2]) / 60;
  }

  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatHoursText(hours: number) {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function isTitanCompany(company: AccountRequestCompany | null | undefined) {
  return company === "titan_produits_industriels";
}

export function getTitanSettings(chauffeur: TitanBillingChauffeur | null | undefined) {
  const enabled =
    chauffeur?.titan_enabled ??
    chauffeur?.titan_billable ??
    chauffeur?.can_work_for_titan_produits_industriels ??
    false;
  const hourlyRate = Number(
    chauffeur?.titan_hourly_rate ?? chauffeur?.taux_base_titan ?? 0
  );
  const benefitsPercent = Number(chauffeur?.social_benefits_percent ?? 15);
  const modeTimeclock = chauffeur?.titan_mode_timeclock ?? enabled;
  const modeSorties = chauffeur?.titan_mode_sorties ?? enabled;

  return {
    enabled,
    modeTimeclock,
    modeSorties,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    benefitsPercent: Number.isFinite(benefitsPercent) ? benefitsPercent : 15,
  };
}

function getTempsHours(row: TitanTempsRow) {
  if ((row.facturable_minutes ?? 0) > 0) return toNumber(row.facturable_minutes) / 60;
  if ((row.payable_minutes ?? 0) > 0) return toNumber(row.payable_minutes) / 60;
  return toNumber(row.duree_heures);
}

function getSortieHours(row: TitanSortieRow) {
  if ((row.facturable_minutes ?? 0) > 0) return toNumber(row.facturable_minutes) / 60;
  if ((row.payable_minutes ?? 0) > 0) return toNumber(row.payable_minutes) / 60;
  return parseDurationHours(row.temps_payable ?? row.temps_total);
}

export function buildTitanBillingRows(options: {
  employes: TitanBillingChauffeur[];
  tempsTitan: TitanTempsRow[];
  sortiesTitan: TitanSortieRow[];
}) {
  const employeMap = new Map(
    options.employes.map((item) => [String(item.id), item] as const)
  );

  const timeclockRows: TitanBillingRow[] = options.tempsTitan
    .filter((row) => isTitanCompany(row.company_context ?? null))
    .map((row) => {
      const employe =
        row.employe_id != null ? employeMap.get(String(row.employe_id)) ?? null : null;
      const settings = getTitanSettings(employe);

      if (!settings.enabled || !settings.modeTimeclock) {
        return null;
      }

      const hours = getTempsHours(row);
      const marginRate = settings.hourlyRate * (settings.benefitsPercent / 100);

      return {
        source: "timeclock",
        source_id: `timeclock-${row.id}`,
        id: row.id,
        employe_id: row.employe_id ?? null,
        employe_nom: row.employe_nom ?? employe?.nom ?? "-",
        date_travail: row.date_travail ?? "",
        company_context: row.company_context ?? null,
        type_travail: row.type_travail ?? "Horodateur Titan",
        livraison: row.livraison ?? "-",
        presence_text: row.temps_presence ?? row.temps_payable ?? formatHoursText(hours),
        payable_text: row.temps_payable ?? formatHoursText(hours),
        non_payable_text: row.temps_non_payable ?? "0 min",
        titan_hours: hours,
        taux_horaire: settings.hourlyRate,
        social_benefits_percent: settings.benefitsPercent,
        total_salaire: hours * settings.hourlyRate,
        total_benefice: hours * marginRate,
        total_titan: hours * (settings.hourlyRate + marginRate),
        statut_paiement_titan: row.statut_paiement_titan ?? "",
      };
    })
    .filter((row): row is TitanBillingRow => row !== null);

  const sortieRows: TitanBillingRow[] = options.sortiesTitan
    .filter((row) => isTitanCompany(row.company_context ?? null))
    .map((row) => {
      const employe =
        row.chauffeur_id != null ? employeMap.get(String(row.chauffeur_id)) ?? null : null;
      const settings = getTitanSettings(employe);

      if (!settings.enabled || !settings.modeSorties) {
        return null;
      }

      const hours = getSortieHours(row);
      const marginRate = settings.hourlyRate * (settings.benefitsPercent / 100);

      return {
        source: "sortie",
        source_id: `sortie-${row.id}`,
        id: row.id,
        employe_id: row.chauffeur_id ?? null,
        employe_nom: employe?.nom ?? "-",
        date_travail: row.date_sortie ?? "",
        company_context: row.company_context ?? employe?.primary_company ?? null,
        type_travail: "Sortie terrain Titan",
        livraison: row.livraison_id ? `Livraison #${row.livraison_id}` : "-",
        presence_text: row.temps_total ?? row.temps_payable ?? formatHoursText(hours),
        payable_text: row.temps_payable ?? row.temps_total ?? formatHoursText(hours),
        non_payable_text: row.temps_non_payable ?? "0 min",
        titan_hours: hours,
        taux_horaire: settings.hourlyRate,
        social_benefits_percent: settings.benefitsPercent,
        total_salaire: hours * settings.hourlyRate,
        total_benefice: hours * marginRate,
        total_titan: hours * (settings.hourlyRate + marginRate),
        statut_paiement_titan: "",
      };
    })
    .filter((row): row is TitanBillingRow => row !== null);

  return [...timeclockRows, ...sortieRows].sort((a, b) => {
    return b.date_travail.localeCompare(a.date_travail);
  });
}

export function buildTitanHoursByEmployee(options: {
  employes: TitanBillingChauffeur[];
  tempsTitan: TitanTempsRow[];
  sortiesTitan: TitanSortieRow[];
}) {
  const rows = buildTitanBillingRows(options);
  const hoursByEmployee = new Map<string, number>();

  for (const row of rows) {
    if (row.employe_id == null) continue;
    const key = String(row.employe_id);
    hoursByEmployee.set(key, (hoursByEmployee.get(key) ?? 0) + row.titan_hours);
  }

  return hoursByEmployee;
}
