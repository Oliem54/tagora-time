import { type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  type EffectifsDepartmentKey,
  normalizeEffectifsDepartmentKey,
  sanitizeDepartmentKeyArray,
  sanitizeLocationKeyArray,
} from "@/app/lib/effectifs-departments.shared";
import {
  computeBreakSummaryForDay,
  createEmptyWeeklyScheduleConfig,
  createWeeklyScheduleFromLegacy,
  deriveLegacyFieldsFromWeekly,
  isWeeklyScheduleDetailConfigured,
  recalculateWeeklyScheduleConfig,
  sanitizeWeeklyScheduleConfig,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";

export { EFFECTIFS_DEPARTMENT_ENTRIES, EFFECTIFS_LOCATION_ENTRIES } from "@/app/lib/effectifs-departments.shared";
export type { WeeklyScheduleConfig } from "@/app/lib/weekly-schedule";

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
  effectifs_department_key?: string | null;
  effectifs_secondary_department_keys?: string[] | null;
  effectifs_primary_location?: string | null;
  effectifs_secondary_locations?: string[] | null;
  can_deliver?: boolean | null;
  default_weekly_hours?: number | null;
  schedule_active?: boolean | null;
  weekly_schedule_config?: unknown | null;
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
  effectifsDepartmentKey: string;
  effectifsSecondaryDepartmentKeys: EffectifsDepartmentKey[];
  effectifsPrimaryLocation: string;
  effectifsSecondaryLocations: string[];
  canDeliver: boolean;
  defaultWeeklyHours: string;
  scheduleActive: boolean;
  weeklySchedule: WeeklyScheduleConfig;
  /**
   * Si vrai : enregistrement sans affectation effectifs (départements / emplacements vides).
   * Défaut : vrai lorsqu’aucune donnée d’affectation n’existe encore sur le profil.
   */
  effectifsExcludeFromPlanning: boolean;
};

function profileHasEffectifsAssignment(
  profile: Partial<EmployeProfile> | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.effectifs_department_key && String(profile.effectifs_department_key).trim()) {
    return true;
  }
  const secDept = sanitizeDepartmentKeyArray(profile.effectifs_secondary_department_keys);
  if (secDept.length > 0) return true;
  if (profile.effectifs_primary_location && String(profile.effectifs_primary_location).trim()) {
    return true;
  }
  const secLoc = sanitizeLocationKeyArray(profile.effectifs_secondary_locations);
  return secLoc.length > 0;
}

export const employeeWorkDays = [
  ["lundi", "Lun"],
  ["mardi", "Mar"],
  ["mercredi", "Mer"],
  ["jeudi", "Jeu"],
  ["vendredi", "Ven"],
  ["samedi", "Sam"],
  ["dimanche", "Dim"],
] as const;

function initialWeeklySchedule(
  profile: Partial<EmployeProfile> | null | undefined
): WeeklyScheduleConfig {
  if (!profile) {
    return recalculateWeeklyScheduleConfig(
      createEmptyWeeklyScheduleConfig("variable")
    );
  }
  const parsed = sanitizeWeeklyScheduleConfig(profile.weekly_schedule_config);
  if (parsed) {
    return recalculateWeeklyScheduleConfig(parsed);
  }
  return createWeeklyScheduleFromLegacy(profile);
}

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
    effectifsDepartmentKey: profile?.effectifs_department_key ?? "",
    effectifsSecondaryDepartmentKeys: sanitizeDepartmentKeyArray(
      profile?.effectifs_secondary_department_keys
    ),
    effectifsPrimaryLocation: profile?.effectifs_primary_location ?? "",
    effectifsSecondaryLocations: sanitizeLocationKeyArray(
      profile?.effectifs_secondary_locations
    ),
    canDeliver: profile?.can_deliver === true,
    defaultWeeklyHours:
      profile?.default_weekly_hours != null
        ? String(profile.default_weekly_hours)
        : "",
    scheduleActive: profile?.schedule_active !== false,
    weeklySchedule: initialWeeklySchedule(profile),
    effectifsExcludeFromPlanning: !profileHasEffectifsAssignment(profile),
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

export function buildEmployePayload(
  form: EmployeFormState,
  options?: { includeEffectifsAssignment?: boolean }
) {
  const includeEffectifs = options?.includeEffectifsAssignment !== false;
  const weekly = recalculateWeeklyScheduleConfig(form.weeklySchedule);
  const derived = deriveLegacyFieldsFromWeekly(weekly);
  const useWeeklyDetail = isWeeklyScheduleDetailConfigured(weekly);
  const bt = derived.breakTemplate;

  const breakSummary =
    useWeeklyDetail && bt
      ? computeBreakSummaryForDay(bt)
      : computeBreakSummary(form);
  const breakAmMinutes =
    useWeeklyDetail && bt
      ? bt.breakAm.minutes > 0
        ? bt.breakAm.minutes
        : null
      : normalizeInteger(form.break_am_minutes);
  const lunchMinutes =
    useWeeklyDetail && bt
      ? bt.lunch.minutes > 0
        ? bt.lunch.minutes
        : null
      : normalizeInteger(form.lunch_minutes);
  const breakPmMinutes =
    useWeeklyDetail && bt
      ? bt.breakPm.minutes > 0
        ? bt.breakPm.minutes
        : null
      : normalizeInteger(form.break_pm_minutes);

  const primaryDept =
    normalizeEffectifsDepartmentKey(form.effectifsDepartmentKey) ?? null;
  const secondaryDeptKeys = sanitizeDepartmentKeyArray(
    form.effectifsSecondaryDepartmentKeys
  ).filter((k) => k !== primaryDept);

  const payload: Record<string, unknown> = {
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
    schedule_start: useWeeklyDetail
      ? derived.schedule_start
      : normalizeString(form.schedule_start),
    schedule_end: useWeeklyDetail
      ? derived.schedule_end
      : normalizeString(form.schedule_end),
    scheduled_work_days: useWeeklyDetail
      ? derived.scheduled_work_days
      : form.scheduled_work_days,
    planned_daily_hours: useWeeklyDetail
      ? derived.planned_daily_hours
      : normalizeNumber(form.planned_daily_hours),
    planned_weekly_hours: useWeeklyDetail
      ? derived.planned_weekly_hours
      : normalizeNumber(form.planned_weekly_hours),
    pause_minutes: useWeeklyDetail && bt ? bt.pauseMinutes : normalizeInteger(form.pause_minutes) ?? 15,
    expected_breaks_count: breakSummary.count,
    break_1_label: "Pause AM",
    break_1_minutes: breakAmMinutes,
    break_1_paid: useWeeklyDetail && bt ? bt.breakAm.paid : form.break_am_paid,
    break_2_label: "Diner",
    break_2_minutes: lunchMinutes,
    break_2_paid: useWeeklyDetail && bt ? bt.lunch.paid : form.lunch_paid,
    break_3_label: "Pause PM",
    break_3_minutes: breakPmMinutes,
    break_3_paid: useWeeklyDetail && bt ? bt.breakPm.paid : form.break_pm_paid,
    break_am_enabled: useWeeklyDetail && bt ? bt.breakAm.enabled : form.break_am_enabled,
    break_am_time: useWeeklyDetail && bt
      ? normalizeString(bt.breakAm.time)
      : normalizeString(form.break_am_time),
    break_am_minutes: breakAmMinutes,
    break_am_paid: useWeeklyDetail && bt ? bt.breakAm.paid : form.break_am_paid,
    lunch_enabled: useWeeklyDetail && bt ? bt.lunch.enabled : form.lunch_enabled,
    lunch_time: useWeeklyDetail && bt
      ? normalizeString(bt.lunch.time)
      : normalizeString(form.lunch_time),
    lunch_minutes: lunchMinutes,
    lunch_paid: useWeeklyDetail && bt ? bt.lunch.paid : form.lunch_paid,
    break_pm_enabled: useWeeklyDetail && bt ? bt.breakPm.enabled : form.break_pm_enabled,
    break_pm_time: useWeeklyDetail && bt
      ? normalizeString(bt.breakPm.time)
      : normalizeString(form.break_pm_time),
    break_pm_minutes: breakPmMinutes,
    break_pm_paid: useWeeklyDetail && bt ? bt.breakPm.paid : form.break_pm_paid,
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
    weekly_schedule_config: weekly,
  };

  if (includeEffectifs) {
    if (form.effectifsExcludeFromPlanning) {
      payload.effectifs_department_key = null;
      payload.effectifs_secondary_department_keys = [];
      payload.effectifs_primary_location = null;
      payload.effectifs_secondary_locations = [];
    } else {
      payload.effectifs_department_key = primaryDept;
      payload.effectifs_secondary_department_keys = secondaryDeptKeys;
      payload.effectifs_primary_location = normalizeString(form.effectifsPrimaryLocation);
      payload.effectifs_secondary_locations = sanitizeLocationKeyArray(
        form.effectifsSecondaryLocations
      );
    }
    payload.can_deliver = form.canDeliver;
    payload.default_weekly_hours = normalizeNumber(form.defaultWeeklyHours);
    payload.schedule_active = form.scheduleActive;
  }

  return payload;
}

/** Erreur à afficher avant envoi API, ou null si OK. */
export function validateEffectifsFormForSave(
  form: EmployeFormState,
  opts?: { includeEffectifs?: boolean }
): string | null {
  if (opts?.includeEffectifs === false) return null;
  if (form.effectifsExcludeFromPlanning) return null;
  const primaryDept = normalizeEffectifsDepartmentKey(form.effectifsDepartmentKey);
  const hasSecDept = form.effectifsSecondaryDepartmentKeys.length > 0;
  const hasPrimaryLoc = Boolean(normalizeString(form.effectifsPrimaryLocation));
  const hasSecLoc = form.effectifsSecondaryLocations.length > 0;
  if (!hasSecDept && !hasPrimaryLoc && !hasSecLoc) return null;
  if (primaryDept) return null;
  if (form.effectifsDepartmentKey.trim()) {
    return "Le département effectifs enregistré n'est plus reconnu. Sélectionnez une valeur dans la liste.";
  }
  return "Veuillez sélectionner un département effectifs avant d'enregistrer, ou cochez « Ne pas inclure dans les effectifs (planning) ».";
}

export function formatMoney(value: number | null | undefined) {
  return value == null
    ? "-"
    : new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency: "CAD",
      }).format(value);
}
