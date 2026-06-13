import { parseAutoMissingExpectedPunchMarker } from "@/app/lib/horodateur-expected-punch-missing.shared";
import { isStaffRetroCorrectionException } from "@/app/lib/horodateur-retro-correction.shared";

export type HorodateurExceptionDisplayInput = {
  category?: string | null;
  status?: string | null;
  title?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  employeeName?: string | null;
  employeeLabel?: string | null;
  employeeId?: number | null;
  exceptionType?: string | null;
  reasonLabel?: string | null;
  details?: string | null;
  occurredAt?: string | null;
  priority?: string | null;
  dedupeKey?: string | null;
  createdAt?: string | null;
};

export type HorodateurExceptionTechnicalDetail = {
  label: string;
  value: string;
};

export type HorodateurExceptionDisplay = {
  isHorodateurException: boolean;
  caseLabel: string;
  actionLabel: string;
  humanTitle: string;
  humanSummary: string;
  whyText: string;
  recommendedActionText: string;
  expectedTime: string | null;
  detectedTime: string | null;
  detectedPunchLabel: string;
  employeeName: string;
  employeeIdLabel: string | null;
  dateLabel: string;
  severityLabel: string;
  decisionStatusLabel: string;
  smsText: string;
  emailSubject: string;
  emailPreview: string;
  technicalDetails: HorodateurExceptionTechnicalDetail[];
  exceptionId: string | null;
  horodateurHref: string;
};

type ResolvedCase = {
  caseLabel: string;
  actionLabel: string;
  punchKind: string | null;
};

const FALLBACK_CASE: ResolvedCase = {
  caseLabel: "Exception horaire à corriger",
  actionLabel: "Exception horaire",
  punchKind: null,
};

const PUNCH_CASE_MAP: Record<string, ResolvedCase> = {
  quart_debut: {
    caseLabel: "Début de quart non punché",
    actionLabel: "Début de quart",
    punchKind: "quart_debut",
  },
  quart_fin: {
    caseLabel: "Fin de quart non punchée",
    actionLabel: "Fin de quart",
    punchKind: "quart_fin",
  },
  pause_debut: {
    caseLabel: "Début de pause non punché",
    actionLabel: "Début de pause",
    punchKind: "pause_debut",
  },
  pause_fin: {
    caseLabel: "Fin de pause non punchée",
    actionLabel: "Fin de pause",
    punchKind: "pause_fin",
  },
  dinner_debut: {
    caseLabel: "Début de dîner non punché",
    actionLabel: "Début de dîner",
    punchKind: "dinner_debut",
  },
  diner_debut: {
    caseLabel: "Début de dîner non punché",
    actionLabel: "Début de dîner",
    punchKind: "dinner_debut",
  },
  dinner_fin: {
    caseLabel: "Fin de dîner non punchée",
    actionLabel: "Fin de dîner",
    punchKind: "dinner_fin",
  },
  diner_fin: {
    caseLabel: "Fin de dîner non punchée",
    actionLabel: "Fin de dîner",
    punchKind: "dinner_fin",
  },
  retro_correction: {
    caseLabel: "Correction rétroactive demandée",
    actionLabel: "Correction rétroactive",
    punchKind: null,
  },
  manual_adjustment: {
    caseLabel: "Punch manuel à valider",
    actionLabel: "Punch manuel",
    punchKind: null,
  },
  direction_adjustment: {
    caseLabel: "Correction direction à valider",
    actionLabel: "Correction direction",
    punchKind: null,
  },
  open_shift_over_limit: {
    caseLabel: "Quart ouvert trop longtemps",
    actionLabel: "Quart ouvert",
    punchKind: null,
  },
  quart_ouvert_14h: {
    caseLabel: "Quart ouvert trop longtemps",
    actionLabel: "Quart ouvert",
    punchKind: null,
  },
};

function normalizePunchKind(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "diner_debut") return "dinner_debut";
  if (normalized === "diner_fin") return "dinner_fin";
  return normalized;
}

function parseAutoMissingMarkerLoose(details: string | null | undefined) {
  const strict = parseAutoMissingExpectedPunchMarker(details);
  if (strict) {
    const normalizedEvent = normalizePunchKind(strict.eventType);
    if (!normalizedEvent) {
      return null;
    }
    return { eventType: normalizedEvent, workDate: strict.workDate };
  }

  if (!details) {
    return null;
  }

  const match = /AUTO_MISSING_EXPECTED_PUNCH:([^:\n]+):(\d{4}-\d{2}-\d{2})/.exec(details);
  if (!match) {
    return null;
  }

  const eventType = normalizePunchKind(match[1]);
  const workDate = match[2];
  if (!eventType || !workDate) {
    return null;
  }

  return { eventType, workDate };
}

function isGenericEmployeePlaceholder(value: string | null | undefined) {
  if (!value?.trim()) {
    return true;
  }

  const trimmed = value.trim();
  return (
    trimmed === "—" ||
    trimmed === "Employé" ||
    /^employ[eé]\s*#\d+$/i.test(trimmed)
  );
}

function readMetadataEmployeeName(metadata: Record<string, unknown>) {
  const directKeys = [
    "employee_name",
    "employeeName",
    "full_name",
    "fullName",
    "nom_complet",
    "name",
    "nom",
  ];

  for (const key of directKeys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() && !isGenericEmployeePlaceholder(value)) {
      return value.trim();
    }
  }

  const prenom = typeof metadata.prenom === "string" ? metadata.prenom.trim() : "";
  const nom = typeof metadata.nom === "string" ? metadata.nom.trim() : "";
  const combined = [prenom, nom].filter(Boolean).join(" ").trim();
  if (combined && !isGenericEmployeePlaceholder(combined)) {
    return combined;
  }

  return null;
}

function resolveEmployeeIdentity(input: {
  employeeName?: string | null;
  employeeLabel?: string | null;
  employeeId?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const bodyFields = parseBodyFields(input.message);
  const metadata = input.metadata ?? {};

  const candidates = [
    input.employeeName?.trim(),
    !isGenericEmployeePlaceholder(input.employeeLabel) ? input.employeeLabel?.trim() : null,
    bodyFields.employé?.trim() ?? bodyFields.employe?.trim(),
    readMetadataEmployeeName(metadata),
  ];

  const displayName =
    candidates.find((value) => Boolean(value && !isGenericEmployeePlaceholder(value))) ??
    (input.employeeId != null ? `Employé #${input.employeeId}` : "Employé");

  const employeeIdLabel =
    input.employeeId != null && !isGenericEmployeePlaceholder(displayName)
      ? `ID employé #${input.employeeId}`
      : input.employeeId != null
        ? `ID employé #${input.employeeId}`
        : null;

  return { displayName, employeeIdLabel };
}

function parseBodyFields(message: string | null | undefined) {
  const fields: Record<string, string> = {};
  if (!message) return fields;

  for (const line of message.split("\n")) {
    const match = /^([^:]+)\s*:\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    fields[match[1]!.trim().toLowerCase()] = match[2]!.trim();
  }

  return fields;
}

function extractExpectedTimeFromText(text: string): string | null {
  const match =
    /prévu à\s+(\d{1,2}:\d{2})/i.exec(text) ??
    /prévue à\s+(\d{1,2}:\d{2})/i.exec(text) ??
    /à\s+(\d{1,2}:\d{2})\s*[—-]/i.exec(text);
  return match?.[1] ?? null;
}

function formatWorkDateLabel(workDate: string | null | undefined): string {
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return "—";
  }
  const date = new Date(`${workDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return workDate;
  return date.toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateLabelFromIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function mapSeverityLabel(priority: string | null | undefined): string {
  if (priority === "critical") return "Critique";
  if (priority === "high") return "Élevée";
  if (priority === "medium") return "Avertissement";
  if (priority === "low") return "Info";
  return "À surveiller";
}

function mapDecisionStatusLabel(status: string | null | undefined): string {
  if (status === "open" || status === "failed") return "Décision requise";
  if (status === "handled") return "Alerte classée";
  if (status === "archived") return "Archivée";
  if (status === "cancelled") return "Annulée";
  return "Suivi requis";
}

export function parseHorodateurExceptionIdFromDedupeKey(
  dedupeKey: string | null | undefined
): string | null {
  if (!dedupeKey) return null;
  const match = /^horodateur_exception:(.+)$/.exec(dedupeKey.trim());
  return match?.[1]?.trim() || null;
}

function resolveCaseFromSignals(input: {
  exceptionType: string | null;
  reasonLabel: string | null;
  detailsText: string;
  expectedPunchType: string | null;
  punchType: string | null;
  eventType: string | null;
  correctionType: string | null;
}): ResolvedCase {
  const normalizedExpected =
    normalizePunchKind(input.expectedPunchType) ??
    normalizePunchKind(input.punchType) ??
    normalizePunchKind(input.eventType);

  if (normalizedExpected && PUNCH_CASE_MAP[normalizedExpected]) {
    return PUNCH_CASE_MAP[normalizedExpected]!;
  }

  const exceptionType = (input.exceptionType ?? "").trim().toLowerCase();
  const correctionType = (input.correctionType ?? "").trim().toLowerCase();
  const combined = `${input.reasonLabel ?? ""}\n${input.detailsText}`.toLowerCase();

  if (
    isStaffRetroCorrectionException({
      reason_label: input.reasonLabel,
      details: input.detailsText,
    }) ||
    correctionType === "retro_correction" ||
    combined.includes("correction rétroactive")
  ) {
    return PUNCH_CASE_MAP.retro_correction!;
  }

  if (
    exceptionType === "shift_too_long" ||
    correctionType === "open_shift_over_limit" ||
    correctionType === "quart_ouvert_14h" ||
    /quart ouvert|14\s*h|shift_too_long|trop longtemps/i.test(combined)
  ) {
    return PUNCH_CASE_MAP.open_shift_over_limit!;
  }

  if (
    exceptionType === "direction_manual_correction" ||
    correctionType === "direction_adjustment"
  ) {
    return PUNCH_CASE_MAP.direction_adjustment!;
  }

  if (correctionType === "manual_adjustment" || /punch manuel/i.test(combined)) {
    return PUNCH_CASE_MAP.manual_adjustment!;
  }

  if (exceptionType === "missing_punch_adjustment" && normalizedExpected) {
    return PUNCH_CASE_MAP[normalizedExpected] ?? FALLBACK_CASE;
  }

  if (PUNCH_CASE_MAP[exceptionType]) {
    return PUNCH_CASE_MAP[exceptionType]!;
  }

  return FALLBACK_CASE;
}

function buildHumanSummary(options: {
  employeeName: string;
  resolvedCase: ResolvedCase;
  expectedTime: string | null;
  dateLabel: string;
}): string {
  const { employeeName, resolvedCase, expectedTime, dateLabel } = options;
  const timePart = expectedTime ? ` à ${expectedTime}` : "";
  const datePart = dateLabel !== "—" ? ` le ${dateLabel}` : "";

  switch (resolvedCase.punchKind) {
    case "quart_debut":
      return `${employeeName} devait commencer son quart${timePart}, mais aucun punch de début de quart n'a été enregistré${datePart}.`;
    case "quart_fin":
      return `${employeeName} devait terminer son quart${timePart}, mais aucun punch de fin de quart n'a été enregistré${datePart}.`;
    case "pause_debut":
      return `${employeeName} devait commencer une pause${timePart}, mais aucun punch de début de pause n'a été enregistré${datePart}.`;
    case "pause_fin":
      return `${employeeName} devait terminer une pause${timePart}, mais aucun punch de fin de pause n'a été enregistré${datePart}.`;
    case "dinner_debut":
      return `${employeeName} devait commencer un dîner${timePart}, mais aucun punch de début de dîner n'a été enregistré${datePart}.`;
    case "dinner_fin":
      return `${employeeName} devait terminer un dîner${timePart}, mais aucun punch de fin de dîner n'a été enregistré${datePart}.`;
    case null:
      if (resolvedCase.caseLabel === "Correction rétroactive demandée") {
        return `${employeeName} a demandé une correction rétroactive sur son horodateur${datePart}.`;
      }
      if (resolvedCase.caseLabel === "Quart ouvert trop longtemps") {
        return `${employeeName} a un quart ouvert depuis trop longtemps. Une décision direction est requise${datePart}.`;
      }
      if (resolvedCase.caseLabel === "Punch manuel à valider") {
        return `${employeeName} a soumis un punch manuel qui doit être validé${datePart}.`;
      }
      if (resolvedCase.caseLabel === "Correction direction à valider") {
        return `${employeeName} a une correction direction à valider dans l'horodateur${datePart}.`;
      }
      return `${employeeName} a une exception horaire à corriger dans l'horodateur${datePart}.`;
    default:
      return `${employeeName} a une exception horaire à corriger${datePart}.`;
  }
}

function buildWhyText(options: {
  resolvedCase: ResolvedCase;
  expectedTime: string | null;
  detailsText: string;
}): string {
  const { resolvedCase, expectedTime, detailsText } = options;

  if (resolvedCase.punchKind && expectedTime) {
    const action = resolvedCase.actionLabel.toLowerCase();
    return `L'horaire prévoyait un ${action} à ${expectedTime}. Aucun punch correspondant n'a été trouvé.`;
  }

  if (resolvedCase.caseLabel === "Quart ouvert trop longtemps") {
    return "Le quart est resté ouvert au-delà de la limite de sécurité configurée.";
  }

  if (resolvedCase.caseLabel === "Correction rétroactive demandée") {
    return "Une correction rétroactive a été demandée sur un événement horodateur manquant ou incorrect.";
  }

  const prose = detailsText
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith("AUTO_MISSING_EXPECTED_PUNCH:") &&
        !/^type\s*:/i.test(line)
    );

  return prose || "Une anomalie horodateur nécessite une décision de la direction.";
}

function buildSmsText(options: {
  employeeName: string;
  resolvedCase: ResolvedCase;
  expectedTime: string | null;
  dateLabel: string;
  isReminder?: boolean;
}): string {
  const { employeeName, resolvedCase, expectedTime, dateLabel, isReminder } = options;
  const head = isReminder ? "TAGORA Time (rappel)" : "TAGORA Time";
  const datePart = dateLabel !== "—" ? ` le ${dateLabel}` : "";
  const timePart = expectedTime ? ` prévu à ${expectedTime}` : "";

  if (resolvedCase.punchKind === "quart_debut") {
    return `${head} : ${employeeName} n'a pas punché son début de quart${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }
  if (resolvedCase.punchKind === "quart_fin") {
    return `${head} : ${employeeName} n'a pas punché sa fin de quart${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }
  if (resolvedCase.punchKind === "pause_debut") {
    return `${head} : ${employeeName} n'a pas punché le début de pause${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }
  if (resolvedCase.punchKind === "pause_fin") {
    return `${head} : ${employeeName} n'a pas punché la fin de pause${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }
  if (resolvedCase.punchKind === "dinner_debut") {
    return `${head} : ${employeeName} n'a pas punché le début de dîner${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }
  if (resolvedCase.punchKind === "dinner_fin") {
    return `${head} : ${employeeName} n'a pas punché la fin de dîner${timePart}${datePart}. Décision requise dans l'horodateur.`;
  }

  return `${head} : ${resolvedCase.caseLabel.toLowerCase()} — ${employeeName}${datePart}. Décision requise dans l'horodateur.`;
}

export function resolveHorodateurExceptionDisplay(
  input: HorodateurExceptionDisplayInput
): HorodateurExceptionDisplay | null {
  if (input.category !== "horodateur_exception") {
    return null;
  }

  const bodyFields = parseBodyFields(input.message);
  const detailsText =
    input.details?.trim() ||
    bodyFields["note employé"] ||
    bodyFields["note employe"] ||
    input.message ||
    "";

  const autoMissing = parseAutoMissingMarkerLoose(detailsText);
  const metadata = input.metadata ?? {};

  const exceptionType =
    input.exceptionType?.trim() ||
    bodyFields.type?.trim() ||
    (typeof metadata.exception_type === "string" ? metadata.exception_type : null) ||
    null;

  const reasonLabel =
    input.reasonLabel?.trim() ||
    bodyFields["motif système"]?.trim() ||
    bodyFields["motif systeme"]?.trim() ||
    (typeof metadata.reason_label === "string" ? metadata.reason_label : null) ||
    null;

  const expectedPunchType =
    (typeof metadata.expected_punch_type === "string"
      ? metadata.expected_punch_type
      : null) ||
    (typeof metadata.punch_type === "string" ? metadata.punch_type : null) ||
    autoMissing?.eventType ||
    null;

  const punchType =
    (typeof metadata.punch_type === "string" ? metadata.punch_type : null) ||
    (typeof metadata.event_type === "string" ? metadata.event_type : null) ||
    null;

  const correctionType =
    (typeof metadata.correction_type === "string" ? metadata.correction_type : null) ||
    (typeof metadata.exception_type === "string" ? metadata.exception_type : null) ||
    null;

  const resolvedCase = resolveCaseFromSignals({
    exceptionType,
    reasonLabel,
    detailsText,
    expectedPunchType,
    punchType,
    eventType: autoMissing?.eventType ?? punchType,
    correctionType,
  });

  const { displayName: employeeName, employeeIdLabel } = resolveEmployeeIdentity({
    employeeName: input.employeeName,
    employeeLabel: input.employeeLabel,
    employeeId: input.employeeId,
    message: input.message,
    metadata,
  });

  const expectedTime =
    extractExpectedTimeFromText(detailsText) ||
    extractExpectedTimeFromText(input.message ?? "") ||
    formatTimeFromIso(input.occurredAt) ||
    (typeof metadata.expected_time === "string" ? metadata.expected_time : null);

  const workDate = autoMissing?.workDate ?? null;
  const dateLabel =
    workDate != null
      ? formatWorkDateLabel(workDate)
      : formatDateLabelFromIso(input.occurredAt ?? input.createdAt);

  const detectedTime = formatTimeFromIso(input.occurredAt);

  const humanSummary = buildHumanSummary({
    employeeName,
    resolvedCase,
    expectedTime,
    dateLabel,
  });

  const whyText = buildWhyText({ resolvedCase, expectedTime, detailsText });
  const recommendedActionText =
    "Vérifiez l'horodateur, puis approuvez, refusez ou corrigez l'exception.";

  const emailSubjectPrefix =
    input.status === "open" || input.status === "failed"
      ? "Décision requise"
      : "Horodateur";
  const emailSubject = `${emailSubjectPrefix} — ${resolvedCase.caseLabel.toLowerCase()}`;

  const emailPreview = humanSummary;

  const smsText = buildSmsText({
    employeeName,
    resolvedCase,
    expectedTime,
    dateLabel,
  });

  const exceptionId =
    (typeof metadata.exceptionId === "string" ? metadata.exceptionId : null) ||
    parseHorodateurExceptionIdFromDedupeKey(input.dedupeKey);

  const technicalDetails: HorodateurExceptionTechnicalDetail[] = [
    exceptionType ? { label: "Type technique", value: exceptionType } : null,
    reasonLabel ? { label: "Motif système", value: reasonLabel } : null,
    input.category ? { label: "Catégorie", value: input.category } : null,
    input.title ? { label: "Titre source", value: input.title } : null,
    detailsText ? { label: "Note technique", value: detailsText } : null,
    input.message ? { label: "Corps alerte", value: input.message } : null,
    exceptionId ? { label: "ID exception", value: exceptionId } : null,
  ].filter((item): item is HorodateurExceptionTechnicalDetail => Boolean(item));

  return {
    isHorodateurException: true,
    caseLabel: resolvedCase.caseLabel,
    actionLabel: resolvedCase.actionLabel,
    humanTitle: resolvedCase.caseLabel,
    humanSummary,
    whyText,
    recommendedActionText,
    expectedTime,
    detectedTime,
    detectedPunchLabel: "Aucun",
    employeeName,
    employeeIdLabel,
    dateLabel,
    severityLabel: mapSeverityLabel(input.priority),
    decisionStatusLabel: mapDecisionStatusLabel(input.status),
    smsText,
    emailSubject,
    emailPreview,
    technicalDetails,
    exceptionId,
    horodateurHref: "/direction/horodateur",
  };
}

export type HorodateurPendingExceptionInput = {
  id: string;
  employee_id: number;
  exception_type: string;
  reason_label: string;
  details: string | null;
  status?: string | null;
  priority?: string | null;
  employee?: {
    employeeId?: number;
    fullName?: string | null;
    email?: string | null;
  } | null;
  event?: {
    occurredAt?: string | null;
    occurred_at?: string | null;
    event_time?: string | null;
  } | null;
};

export function resolveHorodateurPendingExceptionDisplay(
  input: HorodateurPendingExceptionInput
): HorodateurExceptionDisplay | null {
  const occurredAt =
    input.event?.occurredAt ?? input.event?.occurred_at ?? input.event?.event_time ?? null;

  return resolveHorodateurExceptionDisplay({
    category: "horodateur_exception",
    status: input.status === "en_attente" ? "open" : input.status ?? "open",
    priority: input.priority,
    exceptionType: input.exception_type,
    reasonLabel: input.reason_label,
    details: input.details,
    employeeName: input.employee?.fullName,
    employeeId: input.employee_id,
    occurredAt,
    metadata: { exceptionId: input.id },
  });
}
