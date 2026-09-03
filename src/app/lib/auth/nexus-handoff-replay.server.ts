/**
 * Atomic TAGORA_HANDOFF_V1 jti+nonce consumption. Insert-only; unique conflict = replay.
 * No SELECT-then-INSERT on consume. No raw token stored or logged.
 */

import { NEXUS_TECHNICAL_MODULE_KEY } from "@/app/lib/auth/nexus-handoff-config";
import type { NexusHandoffClaims } from "@/app/lib/auth/nexus-handoff";

export type NexusReplayDenyReason =
  | "replay"
  | "expired_token"
  | "invalid_module_key"
  | "actor_mismatch"
  | "organization_mismatch"
  | "store_unavailable";

export type NexusReplayResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: NexusReplayDenyReason };

export type NexusReplayStore = {
  insertReceipt(input: {
    jti: string;
    nonce: string;
    module_key: string;
    nexus_organization_id: string;
    nexus_actor_id: string;
    membership_id: string;
    expires_at: string;
    consumed_at: string;
    created_at: string;
  }): Promise<{ duplicate: boolean }>;
  /** GET-only lookup. Consume stays insert-only; never used to accept a replay. */
  findReceiptByJti?(jti: string): Promise<boolean>;
  findReceiptByNonce?(nonce: string): Promise<boolean>;
};

const POSTGRES_UNIQUE_VIOLATION = "23505";

function fail(reason: NexusReplayDenyReason): NexusReplayResult {
  return { ok: false, reason };
}

export async function defaultNexusReplayStore(): Promise<NexusReplayStore> {
  const { createAdminSupabaseClient } = await import("@/app/lib/supabase/admin");
  const supabase = createAdminSupabaseClient();
  return {
    async insertReceipt(input) {
      const { error } = await supabase.from("horora_nexus_handoff_receipts").insert(input);
      if (!error) return { duplicate: false };
      if (error.code === POSTGRES_UNIQUE_VIOLATION) return { duplicate: true };
      throw new Error(error.message);
    },
    async findReceiptByJti(jti) {
      const { data, error } = await supabase
        .from("horora_nexus_handoff_receipts")
        .select("jti")
        .eq("jti", jti)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.jti === "string" && data.jti === jti;
    },
    async findReceiptByNonce(nonce) {
      const { data, error } = await supabase
        .from("horora_nexus_handoff_receipts")
        .select("nonce")
        .eq("nonce", nonce)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.nonce === "string" && data.nonce === nonce;
    },
  };
}

export async function isNexusHandoffReplayConsumed(
  input: { jti: string; nonce: string },
  options?: { store?: NexusReplayStore }
): Promise<{ ok: true; consumed: boolean } | { ok: false; reason: "store_unavailable" }> {
  const jti = input.jti.trim();
  const nonce = input.nonce.trim();
  if (!jti || !nonce) return { ok: true, consumed: false };
  try {
    const store = options?.store ?? (await defaultNexusReplayStore());
    const jtiConsumed = store.findReceiptByJti ? await store.findReceiptByJti(jti) : false;
    const nonceConsumed = store.findReceiptByNonce
      ? await store.findReceiptByNonce(nonce)
      : false;
    return { ok: true, consumed: jtiConsumed || nonceConsumed };
  } catch {
    return { ok: false, reason: "store_unavailable" };
  }
}

export async function consumeNexusHandoffJti(
  claims: NexusHandoffClaims,
  options?: {
    store?: NexusReplayStore;
    nowSeconds?: number;
  }
): Promise<NexusReplayResult> {
  if (claims.module_key !== NEXUS_TECHNICAL_MODULE_KEY) {
    return fail("invalid_module_key");
  }
  if (!claims.jti.trim() || !claims.nonce.trim()) {
    return fail("replay");
  }

  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp < nowSeconds) {
    return fail("expired_token");
  }

  const nowIso = new Date(nowSeconds * 1000).toISOString();
  try {
    const store = options?.store ?? (await defaultNexusReplayStore());
    const result = await store.insertReceipt({
      jti: claims.jti,
      nonce: claims.nonce,
      module_key: claims.module_key,
      nexus_organization_id: claims.organization_id,
      nexus_actor_id: claims.user_id,
      membership_id: claims.membership_id,
      expires_at: new Date(claims.exp * 1000).toISOString(),
      consumed_at: nowIso,
      created_at: nowIso,
    });
    if (result.duplicate) return fail("replay");
    return { ok: true };
  } catch {
    return fail("store_unavailable");
  }
}

export function assertHandoffBindingConsistency(
  claims: NexusHandoffClaims,
  binding: { nexusActorId: string; nexusOrganizationId: string }
): NexusReplayResult {
  if (claims.user_id !== binding.nexusActorId) {
    return fail("actor_mismatch");
  }
  if (claims.organization_id !== binding.nexusOrganizationId) {
    return fail("organization_mismatch");
  }
  return { ok: true };
}
