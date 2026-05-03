import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  deleteUnusedQuickActionTokensForException,
  insertQuickActionToken,
} from "@/app/lib/horodateur-v1/repository";

const QUICK_ACTION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * URL publique pour construire les liens magiques (courriel / SMS).
 * Ordre : NEXT_PUBLIC_APP_URL, APP_PUBLIC_BASE_URL (serveur), VERCEL_URL.
 */
export function resolvePublicAppBaseUrl(): string | null {
  const trim = (v: string | undefined) => v?.trim().replace(/\/$/, "") ?? "";
  const explicit = trim(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;
  const serverFallback = trim(process.env.APP_PUBLIC_BASE_URL);
  if (serverFallback) return serverFallback;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  return null;
}

export function hashHorodateurQuickActionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateHorodateurQuickActionRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Émet une paire de liens (approuver / refuser). Retourne null si NEXT_PUBLIC_APP_URL manque.
 * Invalide les jetons non utilisés précédents pour cette exception.
 */
export async function issueHorodateurExceptionQuickActionPair(exceptionId: string): Promise<{
  approveUrl: string;
  rejectUrl: string;
} | null> {
  const baseUrl = resolvePublicAppBaseUrl();
  if (!baseUrl) {
    return null;
  }

  await deleteUnusedQuickActionTokensForException(exceptionId);
  const expiresAt = new Date(Date.now() + QUICK_ACTION_TTL_MS).toISOString();

  const approveRaw = generateHorodateurQuickActionRawToken();
  const rejectRaw = generateHorodateurQuickActionRawToken();

  const approveHash = hashHorodateurQuickActionToken(approveRaw);
  const rejectHash = hashHorodateurQuickActionToken(rejectRaw);

  await insertQuickActionToken({
    exceptionId,
    action: "approve",
    tokenHash: approveHash,
    expiresAt,
  });
  await insertQuickActionToken({
    exceptionId,
    action: "reject",
    tokenHash: rejectHash,
    expiresAt,
  });

  const buildUrl = (action: "approve" | "reject", token: string) => {
    const params = new URLSearchParams();
    params.set("exceptionId", exceptionId);
    params.set("action", action);
    params.set("token", token);
    return `${baseUrl}/api/direction/horodateur/exceptions/quick-action?${params.toString()}`;
  };

  return {
    approveUrl: buildUrl("approve", approveRaw),
    rejectUrl: buildUrl("reject", rejectRaw),
  };
}

const PLACEHOLDER_ACTOR_UUID = /^xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx$/i;

/** Utilisateur Auth « système » pour les actions via lien magique (à créer en production). */
export function getHorodateurQuickActionActorUserId(): string | null {
  const id = process.env.HORODATEUR_QUICK_ACTION_ACTOR_UUID?.trim();
  if (!id || PLACEHOLDER_ACTOR_UUID.test(id) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return null;
  }
  return id;
}
