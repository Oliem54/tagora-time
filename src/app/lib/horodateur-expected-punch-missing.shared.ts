/**
 * Escalade automatique des punchs attendus manquants (cron lateness-check).
 *
 * Source de vérité côté direction : `reminder_delay_minutes` dans
 * `horodateur_direction_alert_config` (champ existant « Délai de rappel »).
 *
 * Distinct de `horodateur_tolerance_before_start_minutes` (profil employé) :
 * tolérance au moment où l'employé pointe réellement, pas au pipeline auto.
 *
 * Règle :
 * - reminderMinutes        = délai de rappel configuré (défaut 5)
 * - officialExceptionMinutes = reminderMinutes + 5
 * - priorityMinutes        = reminderMinutes + 10
 *
 * Correction rétroactive manuelle direction/admin : immédiate (createStaffRetroCorrectionRequest).
 */

export const HORODATEUR_RECOMMENDED_REMINDER_DELAY_MINUTES = 5;
export const HORODATEUR_MISSING_PUNCH_EXCEPTION_OFFSET_MINUTES = 5;
export const HORODATEUR_MISSING_PUNCH_PRIORITY_OFFSET_MINUTES = 10;

/** Seuil unique absence / retard matin : alerte Direction, SMS employé, AUTO_MISSING quart_debut. */
export const HORODATEUR_DIRECTION_ABSENCE_ALERT_MINUTES = 30;

/** Alias historique : seuil de surveillance / rappel doux par défaut. */
export const HORODATEUR_DEFAULT_LATENESS_TOLERANCE_MINUTES =
  HORODATEUR_RECOMMENDED_REMINDER_DELAY_MINUTES;

/** @deprecated Utiliser resolveMissingPunchEscalationMinutes().watchMinutes */
export const HORODATEUR_MISSING_PUNCH_WATCH_MINUTES = HORODATEUR_RECOMMENDED_REMINDER_DELAY_MINUTES;

/** @deprecated Utiliser resolveMissingPunchEscalationMinutes().exceptionMinutes */
export const HORODATEUR_MISSING_PUNCH_EXCEPTION_MINUTES = 10;

/** @deprecated Utiliser resolveMissingPunchEscalationMinutes().priorityMinutes */
export const HORODATEUR_MISSING_PUNCH_PRIORITY_MINUTES = 15;

export const MISSING_EXPECTED_PUNCH_REASON_LABEL = "Punch attendu manquant";

export const MISSING_EXPECTED_PUNCH_PRIORITY_REASON_LABEL =
  "Punch attendu manquant — priorité direction";

export const HORODATEUR_ALERT_CONFIG_RECOMMENDED_BADGE = "Paramètres recommandés";

export const HORODATEUR_ALERT_CONFIG_RECOMMENDED_SUMMARY =
  "Recommandé : rappel après 5 min, exception à 10 min, priorité à 15 min.";

export const HORODATEUR_ALERT_CONFIG_DELAY_HELP_TEXT =
  "Le délai de rappel détermine la première alerte. L'exception officielle apparaît 5 minutes plus tard, puis la priorité direction 10 minutes plus tard. Les corrections manuelles sont envoyées immédiatement en approbation.";

export const HORODATEUR_DIRECTION_MISSING_PUNCH_HELP_TEXT =
  "Les oublis détectés automatiquement deviennent des exceptions 5 minutes après le délai de rappel configuré. Les corrections demandées manuellement sont envoyées immédiatement en approbation.";

export const AUTO_MISSING_EXPECTED_PUNCH_MARKER_PREFIX = "AUTO_MISSING_EXPECTED_PUNCH:";

export type AutoMissingExpectedPunchEventType =
  | "quart_debut"
  | "pause_debut"
  | "pause_fin"
  | "dinner_debut"
  | "dinner_fin"
  | "quart_fin";

const MORNING_PUNCH_EVENT_TYPES = new Set<string>(["quart_debut", "punch_in"]);

/** Punchs post-matin qui exigent une entrée réelle employé avant rappel / AUTO_MISSING. */
export const EXPECTED_PUNCH_TYPES_REQUIRING_MORNING_PUNCH: ReadonlySet<AutoMissingExpectedPunchEventType> =
  new Set([
    "pause_debut",
    "pause_fin",
    "dinner_debut",
    "dinner_fin",
    "quart_fin",
  ]);

export function expectedPunchRequiresMorningPunchIn(
  eventType: AutoMissingExpectedPunchEventType
): boolean {
  return EXPECTED_PUNCH_TYPES_REQUIRING_MORNING_PUNCH.has(eventType);
}

/** Entrée matin réelle employé / direction — exclut les événements système inventés. */
export function isRealEmployeeMorningPunchInEvent(event: {
  event_type: string;
  source_kind?: string | null;
  actor_role?: string | null;
}): boolean {
  if (!MORNING_PUNCH_EVENT_TYPES.has(event.event_type)) {
    return false;
  }

  if (event.source_kind === "automatique" || event.actor_role === "systeme") {
    return false;
  }

  return true;
}

/**
 * Présence matinale réelle : punch_in employé/direction ou état opérationnel actif
 * issu d'un punch (y compris en attente d'approbation), jamais d'un AUTO_MISSING système.
 */
export function hasRealMorningPunchInForWorkDay(
  events: Array<{
    event_type: string;
    source_kind?: string | null;
    actor_role?: string | null;
    status?: string | null;
  }>,
  currentState?: { current_state?: string | null } | null
): boolean {
  if (events.some(isRealEmployeeMorningPunchInEvent)) {
    return true;
  }

  const state = currentState?.current_state;
  if (state !== "en_quart" && state !== "en_pause" && state !== "en_diner") {
    return false;
  }

  return events.some(
    (event) =>
      MORNING_PUNCH_EVENT_TYPES.has(event.event_type) &&
      event.status === "en_attente" &&
      event.source_kind !== "automatique" &&
      event.actor_role !== "systeme"
  );
}

export type MissingPunchEscalationMinutes = {
  reminderMinutes: number;
  exceptionMinutes: number;
  priorityMinutes: number;
};

export function normalizeReminderDelayMinutes(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 5) {
    return HORODATEUR_RECOMMENDED_REMINDER_DELAY_MINUTES;
  }
  return parsed;
}

export function resolveMissingPunchEscalationMinutes(
  reminderDelayMinutes?: number | null
): MissingPunchEscalationMinutes {
  const reminderMinutes = normalizeReminderDelayMinutes(reminderDelayMinutes);

  return {
    reminderMinutes,
    exceptionMinutes:
      reminderMinutes + HORODATEUR_MISSING_PUNCH_EXCEPTION_OFFSET_MINUTES,
    priorityMinutes:
      reminderMinutes + HORODATEUR_MISSING_PUNCH_PRIORITY_OFFSET_MINUTES,
  };
}

/** Seuil de création AUTO_MISSING : 30 min pour le début de quart, sinon dérivé du rappel configuré. */
export function resolveAutoMissingExceptionThresholdMinutes(
  eventType: AutoMissingExpectedPunchEventType,
  escalation: MissingPunchEscalationMinutes
): number {
  if (eventType === "quart_debut") {
    return HORODATEUR_DIRECTION_ABSENCE_ALERT_MINUTES;
  }

  return escalation.exceptionMinutes;
}

const EXPECTED_PUNCH_ADMIN_LABELS: Record<AutoMissingExpectedPunchEventType, string> = {
  quart_debut: "Début de quart",
  pause_debut: "Début de pause",
  pause_fin: "Fin de pause",
  dinner_debut: "Début de dîner",
  dinner_fin: "Fin de dîner",
  quart_fin: "Fin de quart",
};

export function buildAutoMissingExpectedPunchMarker(
  eventType: AutoMissingExpectedPunchEventType,
  workDate: string
) {
  return `${AUTO_MISSING_EXPECTED_PUNCH_MARKER_PREFIX}${eventType}:${workDate}`;
}

export function parseAutoMissingExpectedPunchMarker(details: string | null | undefined): {
  eventType: AutoMissingExpectedPunchEventType;
  workDate: string;
} | null {
  if (!details) {
    return null;
  }

  const line = details
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(AUTO_MISSING_EXPECTED_PUNCH_MARKER_PREFIX));

  if (!line) {
    return null;
  }

  const payload = line.slice(AUTO_MISSING_EXPECTED_PUNCH_MARKER_PREFIX.length);
  const separator = payload.lastIndexOf(":");
  if (separator <= 0) {
    return null;
  }

  const eventType = payload.slice(0, separator) as AutoMissingExpectedPunchEventType;
  const workDate = payload.slice(separator + 1);

  if (!(eventType in EXPECTED_PUNCH_ADMIN_LABELS) || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return null;
  }

  return { eventType, workDate };
}

export function isAutoMissingExpectedPunchException(options: {
  reasonLabel?: string | null;
  details?: string | null;
}) {
  if (
    options.reasonLabel === MISSING_EXPECTED_PUNCH_REASON_LABEL ||
    options.reasonLabel === MISSING_EXPECTED_PUNCH_PRIORITY_REASON_LABEL
  ) {
    return true;
  }

  return Boolean(parseAutoMissingExpectedPunchMarker(options.details));
}

export function formatAutoMissingExpectedPunchDetails(options: {
  eventType: AutoMissingExpectedPunchEventType;
  workDate: string;
  scheduledLabel: string;
  priority?: boolean;
  priorityMinutes?: number;
}) {
  const marker = buildAutoMissingExpectedPunchMarker(options.eventType, options.workDate);
  const label = EXPECTED_PUNCH_ADMIN_LABELS[options.eventType];
  const priorityLine = options.priority
    ? `\nPriorité direction — aucun punch enregistré ${options.priorityMinutes ?? 15} minutes après l'heure prévue.`
    : "";

  return `${marker}\n${label} prévu à ${options.scheduledLabel} — punch non enregistré.${priorityLine}`;
}

export function expectedPunchAdminLabel(eventType: AutoMissingExpectedPunchEventType) {
  return EXPECTED_PUNCH_ADMIN_LABELS[eventType];
}

export function isRecommendedReminderDelay(minutes: number) {
  return normalizeReminderDelayMinutes(minutes) === HORODATEUR_RECOMMENDED_REMINDER_DELAY_MINUTES;
}
