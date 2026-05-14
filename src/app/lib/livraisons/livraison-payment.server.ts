import "server-only";

import type { User } from "@supabase/supabase-js";

import { getUserDisplayName } from "@/app/lib/livraisons/audit-stamp.server";

export const PAYMENT_STATUSES = ["paid", "balance_due", "confirmed_on_delivery"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type LivraisonPaymentFields = {
  payment_status: string | null;
  payment_balance_due: number | string | null;
  type_operation?: string | null;
};

export function normalizePaymentBalanceDue(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function normalizePaymentStatus(value: unknown): PaymentStatus | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (s === "paid" || s === "balance_due" || s === "confirmed_on_delivery") return s;
  return null;
}

export function isFinalDeliveryStatut(statut: string | null | undefined): boolean {
  const v = (statut || "").trim().toLowerCase();
  return v === "livree" || v === "ramassee";
}

function operationLabel(typeOperation: string | null | undefined): "livraison" | "ramassage" {
  return (typeOperation || "").trim() === "ramassage_client" ? "ramassage" : "livraison";
}

/**
 * Blocage finalisation : solde > 0 sauf si confirmation explicite dans la requête.
 */
export function assertPaymentAllowsFinalization(options: {
  typeOperation: string | null | undefined;
  mergedStatut: string | null | undefined;
  /** Solde après application du payload (ou valeur courante). */
  effectiveBalanceDue: number;
  paymentConfirmed: boolean;
  paymentMethodWhenConfirming: string | null | undefined;
}): { ok: true } | { ok: false; message: string; httpStatus: 400 | 409 } {
  if (!isFinalDeliveryStatut(options.mergedStatut)) {
    return { ok: true };
  }

  if (options.effectiveBalanceDue <= 0.009) {
    return { ok: true };
  }

  if (
    options.paymentConfirmed === true &&
    typeof options.paymentMethodWhenConfirming === "string" &&
    options.paymentMethodWhenConfirming.trim().length > 0
  ) {
    return { ok: true };
  }

  const label = operationLabel(options.typeOperation);
  const amount = options.effectiveBalanceDue.toFixed(2);
  return {
    ok: false,
    httpStatus: 409,
    message: `Paiement requis avant de finaliser cette ${label}. Solde a payer : ${amount} $`,
  };
}

export function buildPaymentConfirmationFields(user: User, paymentMethod: string) {
  const now = new Date().toISOString();
  return {
    payment_status: "paid" as const,
    payment_balance_due: 0,
    payment_method: paymentMethod.trim(),
    payment_confirmed_at: now,
    payment_confirmed_by_user_id: user.id,
    payment_confirmed_by_name: getUserDisplayName(user),
  };
}

export type CreatePaymentInput = {
  payment_client_paid_full?: unknown;
  payment_status?: unknown;
  payment_balance_due?: unknown;
  payment_method?: unknown;
  payment_note?: unknown;
};

/**
 * Derive les champs DB paiement a l'insertion.
 * Comportement par defaut (aucun champ paiement) : paye au complet (retrocompat API).
 */
export function resolvePaymentForCreate(input: CreatePaymentInput): {
  payment_status: PaymentStatus;
  payment_balance_due: number;
  payment_method: string | null;
  payment_note: string | null;
} {
  const method =
    typeof input.payment_method === "string" && input.payment_method.trim()
      ? input.payment_method.trim()
      : null;
  const note =
    typeof input.payment_note === "string" && input.payment_note.trim()
      ? input.payment_note.trim()
      : null;

  const explicitStatus = normalizePaymentStatus(input.payment_status);
  const balanceRaw = normalizePaymentBalanceDue(input.payment_balance_due);

  const paidFullFlag = input.payment_client_paid_full === true;
  const notPaidFullFlag = input.payment_client_paid_full === false;

  if (notPaidFullFlag || explicitStatus === "balance_due") {
    if (balanceRaw <= 0.009) {
      throw new Error(
        "Solde a payer requis : indiquez un montant superieur a 0 lorsque le client n a pas paye au complet."
      );
    }
    return {
      payment_status: "balance_due",
      payment_balance_due: balanceRaw,
      payment_method: method,
      payment_note: note,
    };
  }

  if (paidFullFlag || explicitStatus === "paid" || explicitStatus === "confirmed_on_delivery") {
    return {
      payment_status: explicitStatus === "confirmed_on_delivery" ? "confirmed_on_delivery" : "paid",
      payment_balance_due: 0,
      payment_method: method,
      payment_note: note,
    };
  }

  // Aucun indicateur explicite : inferer depuis le solde saisi seul
  if (balanceRaw > 0.009) {
    return {
      payment_status: "balance_due",
      payment_balance_due: balanceRaw,
      payment_method: method,
      payment_note: note,
    };
  }

  return {
    payment_status: "paid",
    payment_balance_due: 0,
    payment_method: method,
    payment_note: note,
  };
}

/**
 * Fusionne la confirmation de paiement (champs serveur) si demandee dans le JSON brut.
 * `payment_confirmed` ne doit pas etre ecrit en base.
 */
export function mergePaymentConfirmationFromRequest(
  raw: Record<string, unknown>,
  payload: Record<string, unknown>,
  user: User
): { merge: Record<string, unknown>; error?: { message: string; status: number } } {
  const paymentConfirmed = raw.payment_confirmed === true;
  let merge = { ...payload };
  if (paymentConfirmed) {
    const method = typeof raw.payment_method === "string" ? raw.payment_method.trim() : "";
    if (!method) {
      return {
        merge,
        error: {
          message: "payment_method requis lorsque payment_confirmed est true.",
          status: 400,
        },
      };
    }
    merge = { ...merge, ...buildPaymentConfirmationFields(user, method) };
  }
  return { merge };
}

export function gateFinalizationAfterMerge(options: {
  currentStatut: string | null | undefined;
  currentBalanceDue: unknown;
  currentTypeOperation: string | null | undefined;
  mergePatch: Record<string, unknown>;
  paymentConfirmed: boolean;
  confirmationMethodTrimmed: string;
}): ReturnType<typeof assertPaymentAllowsFinalization> {
  const mergedStatut =
    options.mergePatch.statut !== undefined && options.mergePatch.statut !== null
      ? String(options.mergePatch.statut)
      : options.currentStatut ?? null;
  const effectiveBalance =
    options.mergePatch.payment_balance_due !== undefined
      ? normalizePaymentBalanceDue(options.mergePatch.payment_balance_due)
      : normalizePaymentBalanceDue(options.currentBalanceDue);
  return assertPaymentAllowsFinalization({
    typeOperation: options.currentTypeOperation,
    mergedStatut,
    effectiveBalanceDue: effectiveBalance,
    paymentConfirmed: options.paymentConfirmed,
    paymentMethodWhenConfirming:
      options.paymentConfirmed && options.confirmationMethodTrimmed
        ? options.confirmationMethodTrimmed
        : null,
  });
}
