"use client";

import { employeePunchRequestInit } from "@/app/lib/employee-punch-session.client";
import type { buildForgottenArrivalAudit } from "@/app/lib/employee-punch-guidance.shared";

export type ForgottenArrivalAudit = ReturnType<typeof buildForgottenArrivalAudit>;

export type ForgottenArrivalResponse = {
  ok: boolean;
  message: string;
  audit: ForgottenArrivalAudit | null;
  alreadySubmitted: boolean;
};

export async function postForgottenArrivalRequest(input: {
  date: string;
  time: string;
  reason: string;
}): Promise<ForgottenArrivalResponse> {
  const response = await fetch(
    "/api/horodateur/forgotten-arrival",
    employeePunchRequestInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workDate: input.date,
        time: input.time,
        reason: input.reason,
      }),
    })
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        summary?: string;
        audit?: ForgottenArrivalAudit;
        alreadySubmitted?: boolean;
        status?: string;
      }
    | null;

  if (response.status === 401) {
    return {
      ok: false,
      message: "Votre session a expiré. Reconnectez-vous, puis renvoyez la demande.",
      audit: null,
      alreadySubmitted: false,
    };
  }

  if (!response.ok || !payload?.audit) {
    return {
      ok: false,
      message: payload?.error ?? "La demande d'arrivée oubliée n'a pas pu être envoyée.",
      audit: null,
      alreadySubmitted: false,
    };
  }

  const statusLabel =
    payload.status === "en_attente" ? "En attente d'approbation" : payload.status ?? "En attente d'approbation";
  const summary = payload.summary ?? "Demande enregistrée.";
  return {
    ok: true,
    message: payload.alreadySubmitted
      ? `${summary} Cette demande était déjà en cours. Statut : ${statusLabel}.`
      : `${summary} Statut : ${statusLabel}.`,
    audit: payload.audit,
    alreadySubmitted: payload.alreadySubmitted === true,
  };
}
