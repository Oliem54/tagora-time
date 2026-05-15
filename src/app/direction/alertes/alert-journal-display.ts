/**
 * Présentation lisible du journal des alertes (résumés humains, détails techniques repliables).
 */

export type JournalRowForDisplay = {
  id: string;
  createdAt: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  message: string | null;
  employeeLabel: string;
  employeeId: number | null;
  companyKey: string | null;
  emailDelivery: string;
  smsDelivery: string;
  sourceModule: string;
  linkHref?: string | null;
};

/** Textes affichés lorsqu’aucune heuristique ne permet d’expliquer précisément l’alerte. */
export const FALLBACK_SUMMARY =
  "Une alerte technique a été détectée dans le système.";
export const FALLBACK_PROBABLE_CAUSE =
  "Le système a reçu un message technique ou une réponse fournisseur qui doit être vérifiée.";
export const FALLBACK_RECOMMENDED_ACTION =
  "Ouvrir le détail technique et vérifier le message brut, le fournisseur ou le code d'erreur.";

export type TechnicalDetailEntry = {
  label: string;
  value: string;
};

export type JournalHumanView = {
  alertTypeLabel: string;
  simpleTitle: string;
  priorityLabel: string;
  statusLabel: string;
  targetLabel: string;
  formattedDate: string;
  summary: string;
  probableCause: string;
  recommendedAction: string;
  technicalDetails: TechnicalDetailEntry[];
  rawMessage: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Ouverte",
  failed: "Échec technique",
  handled: "Traitée",
  archived: "Archivée",
  cancelled: "Annulée",
  snoozed: "Reportée",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Avertissement",
  low: "Info",
};

const CATEGORY_LABEL: Record<string, string> = {
  notification_failure: "Notification",
  horodateur_exception: "Horodateur",
  livraison_ramassage: "Livraison",
  delivery_incident: "Livraison",
  mission_internal_note: "Notification",
  employee_expense: "Dépenses",
  employees: "Employés",
  system: "Système",
  communication_template: "Courriel",
  titan_refacturation: "Refacturation",
};

const ALERT_TYPE_SLUG: Record<string, string> = {
  "horodateur_expected_punch:start": "début de quart",
  "horodateur_expected_punch:end": "fin de quart",
  "horodateur_expected_punch:break_start": "début de pause",
  "horodateur_expected_punch:break_end": "fin de pause",
  sms_inbound: "SMS entrant",
};

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonBlocks(raw: string): { prose: string[]; jsonStrings: string[] } {
  const prose: string[] = [];
  const jsonStrings: string[] = [];
  const parts = raw.split(/\n{2,}/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (looksLikeJson(trimmed)) {
      jsonStrings.push(trimmed);
    } else {
      prose.push(trimmed);
    }
  }
  if (jsonStrings.length === 0 && prose.length === 1) {
    const single = prose[0]!;
    const brace = single.indexOf("{");
    if (brace > 0) {
      const before = single.slice(0, brace).trim();
      const after = single.slice(brace).trim();
      if (looksLikeJson(after)) {
        prose.length = 0;
        if (before) prose.push(before);
        jsonStrings.push(after);
      }
    }
  }
  return { prose, jsonStrings };
}

function flattenMetadata(obj: unknown, prefix = ""): TechnicalDetailEntry[] {
  const out: TechnicalDetailEntry[] = [];
  if (obj == null) return out;
  if (typeof obj !== "object") {
    if (prefix) out.push({ label: prefix, value: String(obj) });
    return out;
  }
  if (Array.isArray(obj)) {
    out.push({ label: prefix || "tableau", value: JSON.stringify(obj, null, 2) });
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flattenMetadata(v, key));
    } else {
      out.push({ label: key, value: v == null ? "—" : String(v) });
    }
  }
  return out;
}

const TECH_LABEL_FR: Record<string, string> = {
  error_code: "Code erreur",
  error: "Erreur",
  provider: "Fournisseur",
  provider_response: "Réponse fournisseur",
  event_id: "ID événement",
  reason: "Raison",
  message: "Message technique",
  status: "Statut technique",
  code: "Code",
  details: "Détails",
  metadata: "Métadonnées",
  related_table: "Table liée",
  related_id: "ID lié",
  channel: "Canal",
  alert_id: "ID alerte",
  twilio_code: "Code Twilio",
  http_status: "Statut HTTP",
};

function labelForTechKey(key: string): string {
  const base = key.split(".").pop() ?? key;
  return TECH_LABEL_FR[base] ?? TECH_LABEL_FR[key] ?? key.replace(/_/g, " ");
}

function humanizeAlertTypeSlug(slug: string): string {
  if (ALERT_TYPE_SLUG[slug]) return ALERT_TYPE_SLUG[slug];
  if (slug.startsWith("horodateur_expected_punch:")) {
    const part = slug.split(":")[1];
    return part ? `pointage ${part.replace(/_/g, " ")}` : "horodateur";
  }
  return slug.replace(/_/g, " ");
}

export function inferAlertTypeLabel(row: JournalRowForDisplay): string {
  if (row.smsDelivery === "failed" || row.sourceModule === "sms_alerts_log") return "SMS";
  if (row.emailDelivery === "failed" || row.sourceModule === "internal_mentions") return "Courriel";
  const cat = CATEGORY_LABEL[row.category] ?? row.category;
  if (cat === "Horodateur") return "Horodateur";
  if (cat === "Livraison") return "Livraison";
  if (cat === "Notification") return "Notification";
  if (row.category === "communication_template") return "Courriel";
  return cat !== row.category ? cat : "Alerte";
}

export function formatJournalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${datePart}, ${h} h ${m}`;
}

export function priorityLabelFr(priority: string): string {
  return PRIORITY_LABEL[priority] ?? priority;
}

export function statusLabelFr(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function categoryLabelFr(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/_/g, " ");
}

function inferTargetLabel(row: JournalRowForDisplay): string {
  if (row.employeeLabel && row.employeeLabel !== "—") return row.employeeLabel;
  if (row.employeeId != null) return `Employé #${row.employeeId}`;
  if (row.companyKey) return `Compagnie ${row.companyKey}`;
  if (row.category === "system" || row.sourceModule === "system") return "Système";
  if (row.sourceModule === "internal_mentions") return "Direction";
  return "—";
}

function simplifyTitle(row: JournalRowForDisplay, alertType: string): string {
  let t = row.title.trim();
  const smsMatch = /^SMS\s*[—–-]\s*(.+)$/i.exec(t);
  if (smsMatch) {
    const slug = smsMatch[1]!.trim();
    return `Échec SMS — ${humanizeAlertTypeSlug(slug)}`;
  }
  const envoiMatch = /^Échec envoi\s*:\s*(.+)$/i.exec(t);
  if (envoiMatch) {
    return `Échec notification — ${envoiMatch[1]!.trim()}`;
  }
  if (/^notification_failure$/i.test(t) || t === row.category) {
    return `Échec ${alertType.toLowerCase()}`;
  }
  if (/mfa/i.test(t)) return "Échec MFA";
  if (/resend/i.test(t)) return "Échec envoi courriel";
  if (/twilio/i.test(t)) return `Échec ${alertType}`;
  return t;
}

function textSignals(text: string): { lower: string; hasTwilio: boolean; hasResend403: boolean; hasAuth: boolean; hasMfa: boolean } {
  const lower = text.toLowerCase();
  return {
    lower,
    hasTwilio: /twilio/.test(lower),
    hasResend403: /resend/.test(lower) && (/403/.test(lower) || /forbidden/.test(lower)),
    hasAuth: /auth|authentification|invalid.*key|unauthorized|401|403/.test(lower),
    hasMfa: /\bmfa\b|multi-?factor/.test(lower),
  };
}

function buildSummaryAndGuidance(
  row: JournalRowForDisplay,
  alertType: string,
  proseLines: string[],
  metaEntries: TechnicalDetailEntry[]
): Pick<JournalHumanView, "summary" | "probableCause" | "recommendedAction"> {
  const combined = [row.title, row.message, ...proseLines, ...metaEntries.map((e) => e.value)].filter(Boolean).join("\n");
  const sig = textSignals(combined);

  const slugFromTitle = /^SMS\s*[—–-]\s*(.+)$/i.exec(row.title)?.[1]?.trim();
  const isShiftStart = slugFromTitle === "horodateur_expected_punch:start" || /début de quart|shift.?start|expected_punch:start/i.test(combined);
  const isShiftEnd = slugFromTitle === "horodateur_expected_punch:end" || /fin de quart|shift.?end|expected_punch:end/i.test(combined);

  let summary = proseLines.find((p) => p.length > 0 && !looksLikeJson(p) && !/^Réf\.\s/.test(p)) ?? "";
  if (summary.length > 220) {
    summary = `${summary.slice(0, 217)}…`;
  }

  if (!summary || looksLikeJson(summary) || summary.length < 8) {
    if (alertType === "SMS" && isShiftStart) summary = "Échec d'envoi du SMS de début de quart.";
    else if (alertType === "SMS" && isShiftEnd) summary = "Échec d'envoi du SMS de fin de quart.";
    else if (alertType === "SMS") summary = "Échec d'envoi d'un SMS de notification.";
    else if (alertType === "Courriel") summary = "Échec d'envoi d'un courriel de notification.";
    else if (row.category === "horodateur_exception") summary = "Anomalie signalée par l'horodateur.";
    else if (row.category === "livraison_ramassage" || row.category === "delivery_incident")
      summary = "Problème lié à une livraison ou un ramassage.";
    else summary = simplifyTitle(row, alertType).replace(/^Échec/, "Signalement d'échec");
  }

  summary = summary.replace(/\s+/g, " ").trim();

  let probableCause: string | null = null;
  let recommendedAction: string | null = null;

  if (sig.hasTwilio && sig.hasAuth) {
    probableCause = "Clé Twilio invalide ou authentification refusée par le fournisseur.";
    recommendedAction = "Vérifier les paramètres Twilio dans la configuration SMS.";
  } else if (sig.hasTwilio) {
    probableCause = "Erreur côté fournisseur SMS (Twilio).";
    recommendedAction = "Consulter le tableau de bord Twilio et les journaux d'envoi.";
  } else if (sig.hasResend403) {
    probableCause = "Le fournisseur courriel a refusé l'envoi (erreur 403).";
    recommendedAction = "Vérifier la clé API Resend et les domaines autorisés.";
  } else if (sig.hasMfa) {
    probableCause = "Échec ou bruit lié à l'authentification multifacteur.";
    recommendedAction = "Vérifier la configuration MFA et les journaux de sécurité.";
  } else if (sig.hasAuth) {
    probableCause = "Authentification refusée par le service externe.";
    recommendedAction = "Vérifier les identifiants et permissions du fournisseur.";
  } else if (/timeout|timed out|ETIMEDOUT/i.test(combined)) {
    probableCause = "Délai dépassé lors de la communication avec le service.";
    recommendedAction = "Réessayer plus tard ou vérifier la disponibilité du service.";
  } else if (/invalid.*phone|numéro|phone/i.test(combined)) {
    probableCause = "Numéro de téléphone invalide ou non joignable.";
    recommendedAction = "Vérifier le numéro de l'employé dans son profil.";
  }

  const errLine = proseLines.find((p) => /^erreur/i.test(p) || /error/i.test(p));
  if (!probableCause && errLine && errLine.length < 160) {
    probableCause = errLine.replace(/^erreur courriel\s*:\s*/i, "").trim();
  }

  if (!recommendedAction && row.linkHref) {
    recommendedAction = "Ouvrir la fiche liée pour plus de contexte.";
  }

  const summaryOut = summary.trim() || FALLBACK_SUMMARY;
  const probableCauseOut = probableCause?.trim() || FALLBACK_PROBABLE_CAUSE;
  const recommendedActionOut = recommendedAction?.trim() || FALLBACK_RECOMMENDED_ACTION;

  return {
    summary: summaryOut,
    probableCause: probableCauseOut,
    recommendedAction: recommendedActionOut,
  };
}

export function buildJournalHumanView(row: JournalRowForDisplay): JournalHumanView {
  const alertTypeLabel = inferAlertTypeLabel(row);
  const simpleTitle = simplifyTitle(row, alertTypeLabel);
  const { prose, jsonStrings } = extractJsonBlocks(row.message ?? "");

  const technicalDetails: TechnicalDetailEntry[] = [];
  for (const line of prose) {
    if (/^Réf\.\s/i.test(line)) {
      technicalDetails.push({ label: "Référence", value: line });
    }
  }
  const proseForSummary = prose.filter((p) => !/^Réf\.\s/i.test(p));

  for (const js of jsonStrings) {
    const parsed = tryParseJson(js);
    if (parsed != null) {
      for (const entry of flattenMetadata(parsed)) {
        technicalDetails.push({
          label: labelForTechKey(entry.label),
          value: entry.value,
        });
      }
    } else {
      technicalDetails.push({ label: "Données brutes", value: js });
    }
  }

  if (row.message) {
    const alreadyHasMessage = technicalDetails.some((e) => e.label === "Message technique");
    if (!alreadyHasMessage && proseForSummary.length > 0) {
      technicalDetails.unshift({
        label: "Message technique",
        value: proseForSummary.join("\n\n"),
      });
    }
  }

  if (row.sourceModule) {
    technicalDetails.push({ label: "Module source", value: row.sourceModule });
  }
  if (row.category) {
    technicalDetails.push({ label: "Catégorie technique", value: row.category });
  }
  if (row.emailDelivery !== "—") {
    technicalDetails.push({ label: "Livraison courriel", value: row.emailDelivery });
  }
  if (row.smsDelivery !== "—") {
    technicalDetails.push({ label: "Livraison SMS", value: row.smsDelivery });
  }

  const guidance = buildSummaryAndGuidance(row, alertTypeLabel, proseForSummary, technicalDetails);

  return {
    alertTypeLabel,
    simpleTitle,
    priorityLabel: priorityLabelFr(row.priority),
    statusLabel: statusLabelFr(row.status),
    targetLabel: inferTargetLabel(row),
    formattedDate: formatJournalDate(row.createdAt),
    ...guidance,
    technicalDetails,
    rawMessage: row.message,
  };
}

export function hasTechnicalDetails(view: JournalHumanView): boolean {
  return view.technicalDetails.length > 0 || Boolean(view.rawMessage);
}
