/**
 * Persistance du bloc « paiement client » sans colonnes dédiées :
 * JSON sérialisé en base64 après un marqueur dans commentaire_operationnel ou notes.
 * Si le backend expose plus tard payment_*, parsePaymentFromRow les lit en priorité.
 */

export const PAYMENT_MARKER = "\n\n__TG_PAY1__";

/** Marqueur stable (sans dépendre des retours ligne en tête de champ). */
export const PAYMENT_MARKER_CORE = "__TG_PAY1__";

const OPERATIONAL_NOTES_PREFIX = "\n\nNotes:\n";

/** Colonnes payment_* de livraisons_planifiees (migration non appliquee sur certains envs). */
export const PAYMENT_DB_COLUMN_KEYS = [
  "payment_status",
  "payment_balance_due",
  "payment_method",
  "payment_note",
  "payment_confirmed_at",
  "payment_confirmed_by_user_id",
  "payment_confirmed_by_name",
] as const;

export function stripPaymentDbColumns<T extends Record<string, unknown>>(patch: T): T {
  const out = { ...patch };
  for (const key of PAYMENT_DB_COLUMN_KEYS) {
    delete out[key];
  }
  return out;
}

export type PaymentStatusValue = "paye_complet" | "solde_a_collecter";

export type EmbeddedPaymentPayload = {
  payment_status: PaymentStatusValue;
  payment_balance_due: number;
  payment_method: string;
  payment_note?: string;
  payment_confirmed_at?: string | null;
  payment_confirmed_by_name?: string | null;
};

export type PaymentEmbedSource = "column" | "commentaire" | "notes" | "none";

export type ParsedPayment = EmbeddedPaymentPayload & {
  embedSource: PaymentEmbedSource;
};

const METHOD_LABELS: Record<string, string> = {
  comptant: "Comptant",
  interac: "Interac",
  carte: "Carte de crédit",
  virement: "Virement",
  cheque: "Chèque",
  deja_paye: "Déjà payé",
  autre: "Autre",
};

export const PAYMENT_METHOD_OPTIONS_FORM = [
  { value: "comptant", label: "Comptant" },
  { value: "interac", label: "Interac" },
  { value: "carte", label: "Carte de crédit" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "deja_paye", label: "Déjà payé" },
  { value: "autre", label: "Autre" },
] as const;

/** Méthodes affichées dans la popup de finalisation (pas « Déjà payé »). */
export const PAYMENT_METHOD_OPTIONS_FINALIZE = [
  { value: "comptant", label: "Comptant" },
  { value: "interac", label: "Interac" },
  { value: "carte", label: "Carte de crédit" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "autre", label: "Autre" },
] as const;

export function paymentMethodLabel(code: string): string {
  const k = code.trim().toLowerCase();
  return METHOD_LABELS[k] || (code.trim() || "—");
}

export function parseNumericBalance(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toBase64Utf8(json: string): string {
  return btoa(unescape(encodeURIComponent(json)));
}

function fromBase64Utf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

function findPaymentMarkerIndex(text: string): number {
  return text.indexOf(PAYMENT_MARKER_CORE);
}

function extractNotesAfterPaymentTail(tail: string): string {
  const notesIdx = tail.indexOf(OPERATIONAL_NOTES_PREFIX);
  if (notesIdx === -1) return "";
  return tail.slice(notesIdx + OPERATIONAL_NOTES_PREFIX.length).trimEnd();
}

function tryParseEmbedFromText(text: string): EmbeddedPaymentPayload | null {
  const idx = findPaymentMarkerIndex(text);
  if (idx === -1) return null;
  const afterMarker = text.slice(idx + PAYMENT_MARKER_CORE.length);
  const notesIdx = afterMarker.indexOf(OPERATIONAL_NOTES_PREFIX);
  const b64 = (notesIdx === -1 ? afterMarker : afterMarker.slice(0, notesIdx)).trim();
  if (!b64) return null;
  try {
    const raw = JSON.parse(fromBase64Utf8(b64)) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;
    const st = raw.payment_status;
    if (st !== "paye_complet" && st !== "solde_a_collecter") return null;
    return {
      payment_status: st,
      payment_balance_due: parseNumericBalance(raw.payment_balance_due),
      payment_method: typeof raw.payment_method === "string" ? raw.payment_method : "",
      payment_note: typeof raw.payment_note === "string" ? raw.payment_note : "",
      payment_confirmed_at:
        raw.payment_confirmed_at == null || raw.payment_confirmed_at === ""
          ? null
          : String(raw.payment_confirmed_at),
      payment_confirmed_by_name:
        raw.payment_confirmed_by_name == null || raw.payment_confirmed_by_name === ""
          ? null
          : String(raw.payment_confirmed_by_name),
    };
  } catch {
    return null;
  }
}

function defaultPaid(): EmbeddedPaymentPayload {
  return {
    payment_status: "paye_complet",
    payment_balance_due: 0,
    payment_method: "deja_paye",
    payment_note: "",
    payment_confirmed_at: null,
    payment_confirmed_by_name: null,
  };
}

function readNativeColumns(row: Record<string, unknown>): EmbeddedPaymentPayload | null {
  const st = row.payment_status;
  if (typeof st !== "string" || !st.trim()) return null;
  const normalized = st.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized !== "paye_complet" && normalized !== "solde_a_collecter") return null;
  return {
    payment_status: normalized as PaymentStatusValue,
    payment_balance_due: parseNumericBalance(row.payment_balance_due),
    payment_method: typeof row.payment_method === "string" ? row.payment_method : "",
    payment_note: typeof row.payment_note === "string" ? row.payment_note : "",
    payment_confirmed_at:
      row.payment_confirmed_at == null || row.payment_confirmed_at === ""
        ? null
        : String(row.payment_confirmed_at),
    payment_confirmed_by_name:
      row.payment_confirmed_by_name == null || row.payment_confirmed_by_name === ""
        ? null
        : String(row.payment_confirmed_by_name),
  };
}

export function parsePaymentFromRow(row: Record<string, unknown> | null | undefined): ParsedPayment {
  if (!row) {
    return { ...defaultPaid(), embedSource: "none" };
  }
  const native = readNativeColumns(row);
  if (native) {
    return { ...native, embedSource: "column" };
  }
  const com = String(row.commentaire_operationnel ?? "");
  const fromCom = tryParseEmbedFromText(com);
  if (fromCom) {
    return { ...fromCom, embedSource: "commentaire" };
  }
  const notes = String(row.notes ?? "");
  const fromNotes = tryParseEmbedFromText(notes);
  if (fromNotes) {
    return { ...fromNotes, embedSource: "notes" };
  }
  return { ...defaultPaid(), embedSource: "none" };
}

/**
 * Retire le bloc paiement embarqué et conserve le commentaire lisible
 * (y compris la section « Notes: » éventuellement stockée après le bloc).
 */
export function stripPaymentEmbedFromText(text: string): string {
  const raw = String(text ?? "");
  const idx = findPaymentMarkerIndex(raw);
  if (idx === -1) return raw.trimEnd();

  const head = raw.slice(0, idx).trimEnd();
  const notesSuffix = extractNotesAfterPaymentTail(raw.slice(idx));

  if (!head && !notesSuffix) return "";
  if (!head) return notesSuffix;
  if (!notesSuffix) return head;
  return `${head}\n\n${notesSuffix}`.trim();
}

/** @deprecated Alias — préférer stripPaymentEmbedFromText */
export function stripPaymentMarker(text: string): string {
  return stripPaymentEmbedFromText(text);
}

/** Sépare commentaire affiché et notes formulaire depuis commentaire_operationnel stocké. */
export function splitOperationalCommentForForm(stored: string): {
  commentaire: string;
  notes: string;
} {
  const raw = String(stored ?? "");
  const idx = findPaymentMarkerIndex(raw);
  if (idx === -1) {
    return { commentaire: raw.trimEnd(), notes: "" };
  }
  return {
    commentaire: raw.slice(0, idx).trimEnd(),
    notes: extractNotesAfterPaymentTail(raw.slice(idx)),
  };
}

export function mergePaymentIntoText(cleanText: string, payment: EmbeddedPaymentPayload): string {
  const base = stripPaymentMarker(cleanText).trimEnd();
  const json = JSON.stringify(payment);
  const tail = `${PAYMENT_MARKER}${toBase64Utf8(json)}`;
  if (!base) return tail;
  return `${base}${tail}`;
}

/** Solde résiduel : finalisation bloquée par popup tant que ce montant est > 0. */
export function requiresPaymentFinalizeGate(p: EmbeddedPaymentPayload): boolean {
  return p.payment_balance_due > 0.009;
}

export type PaymentFormInput = {
  paidFull: boolean;
  balanceDue: string;
  method: string;
  note: string;
};

export function embeddedFromFormInput(input: PaymentFormInput): EmbeddedPaymentPayload {
  if (input.paidFull) {
    return {
      payment_status: "paye_complet",
      payment_balance_due: 0,
      payment_method: input.method.trim() || "deja_paye",
      payment_note: input.note.trim() || undefined,
      payment_confirmed_at: null,
      payment_confirmed_by_name: null,
    };
  }
  const raw = input.balanceDue.replace(",", ".").trim();
  const n = Number(raw);
  const balance = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return {
    payment_status: "solde_a_collecter",
    payment_balance_due: balance,
    payment_method: input.method.trim() || "autre",
    payment_note: input.note.trim() || undefined,
    payment_confirmed_at: null,
    payment_confirmed_by_name: null,
  };
}

export function formInputFromParsed(p: ParsedPayment): PaymentFormInput {
  const paidFull = p.payment_status === "paye_complet";
  return {
    paidFull,
    balanceDue: paidFull ? "" : String(p.payment_balance_due),
    method: p.payment_method || (paidFull ? "deja_paye" : "comptant"),
    note: p.payment_note || "",
  };
}

export function validatePaymentFormInput(input: PaymentFormInput): string | null {
  if (input.paidFull) {
    if (!input.method.trim()) return "Choisissez une méthode de paiement prévue ou utilisée.";
    return null;
  }
  const raw = input.balanceDue.replace(",", ".").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) {
    return "Indiquez un solde à payer supérieur à 0.";
  }
  if (!input.method.trim()) return "Choisissez une méthode de paiement prévue ou utilisée.";
  return null;
}

/** Après encaissement à la remise : solde 0, statut payé, horodatage employé. */
export function withFinalizationConfirmation(
  previous: EmbeddedPaymentPayload,
  methodReceived: string,
  confirmedByName: string
): EmbeddedPaymentPayload {
  return {
    ...previous,
    payment_status: "paye_complet",
    payment_balance_due: 0,
    payment_method: methodReceived.trim() || previous.payment_method,
    payment_confirmed_at: new Date().toISOString(),
    payment_confirmed_by_name: confirmedByName.trim() || null,
  };
}

export function pickStorageField(parsed: ParsedPayment): "commentaire_operationnel" | "notes" {
  if (parsed.embedSource === "notes") return "notes";
  return "commentaire_operationnel";
}

/**
 * Met à jour les champs texte où persister le bloc paiement.
 * Si l’embed était dans `notes`, on le réécrit dans `notes` ; sinon dans `commentaire_operationnel`.
 */
export function applyPaymentToRowFields(
  row: Record<string, unknown>,
  parsed: ParsedPayment,
  updatedPayment: EmbeddedPaymentPayload
): { commentaire_operationnel?: string | null; notes?: string | null } {
  const comRaw = String(row.commentaire_operationnel ?? "");
  const notesRaw = String(row.notes ?? "");
  const target = pickStorageField(parsed);
  if (target === "notes") {
    const cleanNotes = stripPaymentMarker(notesRaw);
    return {
      notes: mergePaymentIntoText(cleanNotes, updatedPayment) || null,
    };
  }
  const cleanCom = stripPaymentMarker(comRaw);
  return {
    commentaire_operationnel: mergePaymentIntoText(cleanCom, updatedPayment) || null,
  };
}

/**
 * Pour la fiche journée (inline) : tout nouveau paiement / confirmation
 * est stocké dans `commentaire_operationnel` ; on retire l’embed des `notes` s’il y était pour éviter les doublons.
 */
export function applyPaymentPreferCommentaire(
  row: Record<string, unknown>,
  updatedPayment: EmbeddedPaymentPayload
): { commentaire_operationnel: string | null; notes?: string | null } {
  const parsed = parsePaymentFromRow(row);
  const comRaw = String(row.commentaire_operationnel ?? "");
  const notesRaw = String(row.notes ?? "");
  const cleanCom = stripPaymentMarker(comRaw);
  const out: { commentaire_operationnel: string | null; notes?: string | null } = {
    commentaire_operationnel: mergePaymentIntoText(cleanCom, updatedPayment) || null,
  };
  /** Colonne livraisons_planifiees.notes absente du schéma sur plusieurs environnements : fusion dans commentaire. */
  if (parsed.embedSource === "notes" && notesRaw.includes(PAYMENT_MARKER)) {
    const stripped = stripPaymentMarker(notesRaw).trim();
    if (stripped) {
      out.commentaire_operationnel = out.commentaire_operationnel?.trim().length
        ? `${out.commentaire_operationnel}\n\n${stripped}`
        : stripped;
    }
  }
  return out;
}
