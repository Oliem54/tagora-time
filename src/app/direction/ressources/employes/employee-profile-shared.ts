import { type AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type EmployeProfile = {
  id: number;
  auth_user_id?: string | null;
  nom: string | null;
  telephone: string | null;
  courriel: string | null;
  numero_permis: string | null;
  classe_permis: string | null;
  expiration_permis: string | null;
  restrictions_permis: string | null;
  actif: boolean | null;
  notes: string | null;
  photo_permis_recto_url: string | null;
  photo_permis_verso_url: string | null;
  taux_base_titan: number | null;
  primary_company: AccountRequestCompany | null;
  can_work_for_oliem_solutions: boolean | null;
  can_work_for_titan_produits_industriels: boolean | null;
  social_benefits_percent: number | null;
  titan_billable: boolean | null;
  schedule_start: string | null;
  schedule_end: string | null;
  scheduled_work_days: string[] | null;
  planned_daily_hours: number | null;
  planned_weekly_hours: number | null;
  pause_minutes: number | null;
  expected_breaks_count: number | null;
  break_1_label: string | null;
  break_1_minutes: number | null;
  break_1_paid: boolean | null;
  break_2_label: string | null;
  break_2_minutes: number | null;
  break_2_paid: boolean | null;
  break_3_label: string | null;
  break_3_minutes: number | null;
  break_3_paid: boolean | null;
  break_am_enabled: boolean | null;
  break_am_time: string | null;
  break_am_minutes: number | null;
  break_am_paid: boolean | null;
  lunch_enabled: boolean | null;
  lunch_time: string | null;
  lunch_minutes: number | null;
  lunch_paid: boolean | null;
  break_pm_enabled: boolean | null;
  break_pm_time: string | null;
  break_pm_minutes: number | null;
  break_pm_paid: boolean | null;
  sms_alert_depart_terrain: boolean | null;
  sms_alert_arrivee_terrain: boolean | null;
  sms_alert_sortie: boolean | null;
  sms_alert_retour: boolean | null;
  sms_alert_pause_debut: boolean | null;
  sms_alert_pause_fin: boolean | null;
  sms_alert_dinner_debut: boolean | null;
  sms_alert_dinner_fin: boolean | null;
  sms_alert_quart_debut: boolean | null;
  sms_alert_quart_fin: boolean | null;
  alert_email_enabled: boolean | null;
  alert_sms_enabled: boolean | null;
  is_direction_alert_recipient: boolean | null;
};

export type EmployeFormState = {
  nom: string;
  telephone: string;
  courriel: string;
  numero_permis: string;
  classe_permis: string;
  expiration_permis: string;
  restrictions_permis: string;
  actif: boolean;
  notes: string;
  photo_permis_recto_url: string;
  photo_permis_verso_url: string;
  taux_base_titan: string;
  primary_company: AccountRequestCompany;
  can_work_for_oliem_solutions: boolean;
  can_work_for_titan_produits_industriels: boolean;
  social_benefits_percent: string;
  titan_billable: boolean;
  schedule_start: string;
  schedule_end: string;
  scheduled_work_days: string[];
  planned_daily_hours: string;
  planned_weekly_hours: string;
  pause_minutes: string;
  break_am_enabled: boolean;
  break_am_time: string;
  break_am_minutes: string;
  break_am_paid: boolean;
  lunch_enabled: boolean;
  lunch_time: string;
  lunch_minutes: string;
  lunch_paid: boolean;
  break_pm_enabled: boolean;
  break_pm_time: string;
  break_pm_minutes: string;
  break_pm_paid: boolean;
  sms_alert_depart_terrain: boolean;
  sms_alert_arrivee_terrain: boolean;
  sms_alert_sortie: boolean;
  sms_alert_retour: boolean;
  sms_alert_pause_debut: boolean;
  sms_alert_pause_fin: boolean;
  sms_alert_dinner_debut: boolean;
  sms_alert_dinner_fin: boolean;
  sms_alert_quart_debut: boolean;
  sms_alert_quart_fin: boolean;
  alert_email_enabled: boolean;
  alert_sms_enabled: boolean;
  is_direction_alert_recipient: boolean;
};

export const employeeWorkDays = [
  ["lundi", "Lun"],
  ["mardi", "Mar"],
  ["mercredi", "Mer"],
  ["jeudi", "Jeu"],
  ["vendredi", "Ven"],
  ["samedi", "Sam"],
  ["dimanche", "Dim"],
] as const;

export function buildEmployeForm(
  profile: Partial<EmployeProfile> | null | undefined
): EmployeFormState {
  return {
    nom: profile?.nom ?? "",
    telephone: profile?.telephone ?? "",
    courriel: profile?.courriel ?? "",
    numero_permis: profile?.numero_permis ?? "",
    classe_permis: profile?.classe_permis ?? "",
    expiration_permis: profile?.expiration_permis ?? "",
    restrictions_permis: profile?.restrictions_permis ?? "",
    actif: profile?.actif ?? true,
    notes: profile?.notes ?? "",
    photo_permis_recto_url: profile?.photo_permis_recto_url ?? "",
    photo_permis_verso_url: profile?.photo_permis_verso_url ?? "",
    taux_base_titan:
      profile?.taux_base_titan != null ? String(profile.taux_base_titan) : "",
    primary_company: profile?.primary_company ?? "oliem_solutions",
    can_work_for_oliem_solutions:
      profile?.can_work_for_oliem_solutions ?? true,
    can_work_for_titan_produits_industriels:
      profile?.can_work_for_titan_produits_industriels ?? false,
    social_benefits_percent:
      profile?.social_benefits_percent != null
        ? String(profile.social_benefits_percent)
        : "15",
    titan_billable: profile?.titan_billable ?? false,
    schedule_start: profile?.schedule_start ?? "",
    schedule_end: profile?.schedule_end ?? "",
    scheduled_work_days: profile?.scheduled_work_days ?? [],
    planned_daily_hours:
      profile?.planned_daily_hours != null
        ? String(profile.planned_daily_hours)
        : "",
    planned_weekly_hours:
      profile?.planned_weekly_hours != null
        ? String(profile.planned_weekly_hours)
        : "",
    pause_minutes:
      profile?.pause_minutes != null ? String(profile.pause_minutes) : "15",
    break_am_enabled: profile?.break_am_enabled ?? false,
    break_am_time: profile?.break_am_time ?? "",
    break_am_minutes:
      profile?.break_am_minutes != null ? String(profile.break_am_minutes) : "",
    break_am_paid: profile?.break_am_paid ?? true,
    lunch_enabled: profile?.lunch_enabled ?? false,
    lunch_time: profile?.lunch_time ?? "",
    lunch_minutes:
      profile?.lunch_minutes != null ? String(profile.lunch_minutes) : "",
    lunch_paid: profile?.lunch_paid ?? false,
    break_pm_enabled: profile?.break_pm_enabled ?? false,
    break_pm_time: profile?.break_pm_time ?? "",
    break_pm_minutes:
      profile?.break_pm_minutes != null ? String(profile.break_pm_minutes) : "",
    break_pm_paid: profile?.break_pm_paid ?? true,
    sms_alert_depart_terrain: profile?.sms_alert_depart_terrain ?? true,
    sms_alert_arrivee_terrain: profile?.sms_alert_arrivee_terrain ?? true,
    sms_alert_sortie: profile?.sms_alert_sortie ?? true,
    sms_alert_retour: profile?.sms_alert_retour ?? true,
    sms_alert_pause_debut: profile?.sms_alert_pause_debut ?? true,
    sms_alert_pause_fin: profile?.sms_alert_pause_fin ?? true,
    sms_alert_dinner_debut: profile?.sms_alert_dinner_debut ?? true,
    sms_alert_dinner_fin: profile?.sms_alert_dinner_fin ?? true,
    sms_alert_quart_debut: profile?.sms_alert_quart_debut ?? true,
    sms_alert_quart_fin: profile?.sms_alert_quart_fin ?? true,
    alert_email_enabled: profile?.alert_email_enabled ?? true,
    alert_sms_enabled: profile?.alert_sms_enabled ?? true,
    is_direction_alert_recipient: profile?.is_direction_alert_recipient ?? false,
  };
}

function normalizeString(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeInteger(value: string) {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number.parseInt(value, 10);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function computeBreakSummary(form: EmployeFormState) {
  const items = [
    {
      enabled: form.break_am_enabled,
      minutes: normalizeInteger(form.break_am_minutes),
      paid: form.break_am_paid,
    },
    {
      enabled: form.lunch_enabled,
      minutes: normalizeInteger(form.lunch_minutes),
      paid: form.lunch_paid,
    },
    {
      enabled: form.break_pm_enabled,
      minutes: normalizeInteger(form.break_pm_minutes),
      paid: form.break_pm_paid,
    },
  ];

  const total = items.reduce(
    (sum, item) => sum + (item.enabled && item.minutes ? item.minutes : 0),
    0
  );
  const unpaid = items.reduce(
    (sum, item) =>
      sum +
      (item.enabled && item.minutes && !item.paid ? item.minutes : 0),
    0
  );

  return {
    count: items.filter((item) => item.enabled).length,
    total,
    unpaid,
    paid: total - unpaid,
  };
}

export function buildEmployePayload(form: EmployeFormState) {
  const breakSummary = computeBreakSummary(form);
  const breakAmMinutes = normalizeInteger(form.break_am_minutes);
  const lunchMinutes = normalizeInteger(form.lunch_minutes);
  const breakPmMinutes = normalizeInteger(form.break_pm_minutes);

  return {
    nom: normalizeString(form.nom) ?? "",
    telephone: normalizeString(form.telephone),
    courriel: normalizeString(form.courriel),
    numero_permis: normalizeString(form.numero_permis),
    classe_permis: normalizeString(form.classe_permis),
    expiration_permis: normalizeString(form.expiration_permis),
    restrictions_permis: normalizeString(form.restrictions_permis),
    actif: form.actif,
    notes: normalizeString(form.notes),
    photo_permis_recto_url: normalizeString(form.photo_permis_recto_url),
    photo_permis_verso_url: normalizeString(form.photo_permis_verso_url),
    taux_base_titan: normalizeNumber(form.taux_base_titan),
    primary_company: form.primary_company,
    can_work_for_oliem_solutions: form.can_work_for_oliem_solutions,
    can_work_for_titan_produits_industriels:
      form.can_work_for_titan_produits_industriels,
    social_benefits_percent:
      normalizeNumber(form.social_benefits_percent) ?? 15,
    titan_billable: form.titan_billable,
    schedule_start: normalizeString(form.schedule_start),
    schedule_end: normalizeString(form.schedule_end),
    scheduled_work_days: form.scheduled_work_days,
    planned_daily_hours: normalizeNumber(form.planned_daily_hours),
    planned_weekly_hours: normalizeNumber(form.planned_weekly_hours),
    pause_minutes: normalizeInteger(form.pause_minutes) ?? 15,
    expected_breaks_count: breakSummary.count,
    break_1_label: "Pause AM",
    break_1_minutes: breakAmMinutes,
    break_1_paid: form.break_am_paid,
    break_2_label: "Diner",
    break_2_minutes: lunchMinutes,
    break_2_paid: form.lunch_paid,
    break_3_label: "Pause PM",
    break_3_minutes: breakPmMinutes,
    break_3_paid: form.break_pm_paid,
    break_am_enabled: form.break_am_enabled,
    break_am_time: normalizeString(form.break_am_time),
    break_am_minutes: breakAmMinutes,
    break_am_paid: form.break_am_paid,
    lunch_enabled: form.lunch_enabled,
    lunch_time: normalizeString(form.lunch_time),
    lunch_minutes: lunchMinutes,
    lunch_paid: form.lunch_paid,
    break_pm_enabled: form.break_pm_enabled,
    break_pm_time: normalizeString(form.break_pm_time),
    break_pm_minutes: breakPmMinutes,
    break_pm_paid: form.break_pm_paid,
    sms_alert_depart_terrain: form.sms_alert_depart_terrain,
    sms_alert_arrivee_terrain: form.sms_alert_arrivee_terrain,
    sms_alert_sortie: form.sms_alert_sortie,
    sms_alert_retour: form.sms_alert_retour,
    sms_alert_pause_debut: form.sms_alert_pause_debut,
    sms_alert_pause_fin: form.sms_alert_pause_fin,
    sms_alert_dinner_debut: form.sms_alert_dinner_debut,
    sms_alert_dinner_fin: form.sms_alert_dinner_fin,
    sms_alert_quart_debut: form.sms_alert_quart_debut,
    sms_alert_quart_fin: form.sms_alert_quart_fin,
    alert_email_enabled: form.alert_email_enabled,
    alert_sms_enabled: form.alert_sms_enabled,
    is_direction_alert_recipient: form.is_direction_alert_recipient,
  };
}

export function formatMoney(value: number | null | undefined) {
  return value == null
    ? "-"
    : new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency: "CAD",
      }).format(value);
}
