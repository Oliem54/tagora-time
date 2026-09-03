import { describe, expect, it } from "vitest";
import type { NexusHandoffClaims } from "@/app/lib/auth/nexus-handoff";
import { NEXUS_TECHNICAL_MODULE_KEY } from "@/app/lib/auth/nexus-handoff-config";
import {
  consumeNexusHandoffJti,
  isNexusHandoffReplayConsumed,
  type NexusReplayStore,
} from "@/app/lib/auth/nexus-handoff-replay.server";

const CLAIMS: NexusHandoffClaims = {
  sub: "actor-1",
  jti: "jti-once",
  nonce: "nonce-once",
  iat: 1_700_000_000,
  nbf: 1_700_000_000,
  exp: 1_700_000_060,
  user_id: "actor-1",
  organization_id: "org-1",
  membership_id: "mem-1",
  tenant_id: "tenant-1",
  module_key: NEXUS_TECHNICAL_MODULE_KEY,
  handoff_id: "h1",
  grant_id: "g1",
  grant_version: "1",
};

function memoryStore(): NexusReplayStore & { jtis: string[]; nonces: string[] } {
  const jtis: string[] = [];
  const nonces: string[] = [];
  return {
    jtis,
    nonces,
    async insertReceipt(input) {
      if (jtis.includes(input.jti) || nonces.includes(input.nonce)) {
        return { duplicate: true };
      }
      jtis.push(input.jti);
      nonces.push(input.nonce);
      return { duplicate: false };
    },
    async findReceiptByJti(jti) {
      return jtis.includes(jti);
    },
    async findReceiptByNonce(nonce) {
      return nonces.includes(nonce);
    },
  };
}

describe("Nexus handoff replay store", () => {
  it("consumes jti and nonce once", async () => {
    const store = memoryStore();
    await expect(
      consumeNexusHandoffJti(CLAIMS, { store, nowSeconds: 1_700_000_010 })
    ).resolves.toEqual({ ok: true });
    await expect(
      consumeNexusHandoffJti(CLAIMS, { store, nowSeconds: 1_700_000_010 })
    ).resolves.toEqual({ ok: false, reason: "replay" });
    await expect(
      consumeNexusHandoffJti(
        { ...CLAIMS, jti: "jti-other" },
        { store, nowSeconds: 1_700_000_010 }
      )
    ).resolves.toEqual({ ok: false, reason: "replay" });
  });

  it("looks up consumed jti/nonce without inserting", async () => {
    const store = memoryStore();
    await expect(
      isNexusHandoffReplayConsumed({ jti: CLAIMS.jti, nonce: CLAIMS.nonce }, { store })
    ).resolves.toEqual({ ok: true, consumed: false });
    await consumeNexusHandoffJti(CLAIMS, { store, nowSeconds: 1_700_000_010 });
    await expect(
      isNexusHandoffReplayConsumed({ jti: CLAIMS.jti, nonce: CLAIMS.nonce }, { store })
    ).resolves.toEqual({ ok: true, consumed: true });
    expect(store.jtis).toEqual([CLAIMS.jti]);
  });

  it("denies expired or wrong module before insert", async () => {
    let inserted = false;
    const store: NexusReplayStore = {
      async insertReceipt() {
        inserted = true;
        return { duplicate: false };
      },
    };
    await expect(
      consumeNexusHandoffJti(CLAIMS, { store, nowSeconds: 1_700_000_120 })
    ).resolves.toEqual({ ok: false, reason: "expired_token" });
    await expect(
      consumeNexusHandoffJti(
        { ...CLAIMS, module_key: "tagora_stock_premium" } as unknown as NexusHandoffClaims,
        { store, nowSeconds: 1_700_000_010 }
      )
    ).resolves.toEqual({ ok: false, reason: "invalid_module_key" });
    expect(inserted).toBe(false);
  });
});
