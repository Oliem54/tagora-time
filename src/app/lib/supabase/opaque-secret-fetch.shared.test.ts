import { describe, expect, it, vi } from "vitest";
import {
  isHororaOpaqueSupabaseSecret,
  wrapFetchForOpaqueSupabaseSecret,
} from "@/app/lib/supabase/opaque-secret-fetch.shared";

describe("opaque Supabase secret fetch", () => {
  it("detects only sb_secret keys", () => {
    expect(isHororaOpaqueSupabaseSecret("sb_secret_test")).toBe(true);
    expect(isHororaOpaqueSupabaseSecret("sb_publishable_test")).toBe(false);
    expect(isHororaOpaqueSupabaseSecret("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(
      false
    );
  });

  it("sends sb_secret on apikey and strips Authorization", async () => {
    const baseFetch = vi.fn(async () => new Response(null, { status: 200 }));
    const wrapped = wrapFetchForOpaqueSupabaseSecret(
      "sb_secret_test",
      baseFetch as unknown as typeof fetch
    );
    await wrapped("https://qcgvzdlfsxybrmloijpt.supabase.co/rest/v1/horora_nexus_identity_map", {
      headers: {
        apikey: "sb_secret_test",
        Authorization: "Bearer sb_secret_test",
      },
    });
    expect(baseFetch).toHaveBeenCalledTimes(1);
    const init = baseFetch.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe("sb_secret_test");
    expect(headers.has("Authorization")).toBe(false);
  });
});
