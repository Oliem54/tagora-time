import { describe, expect, it } from "vitest";
import {
  HORORA_PRODUCTION_SUPABASE_URL,
  HORORA_STAGING_SUPABASE_HOST,
  resolveHororaRuntimeSupabaseUrl,
} from "@/app/lib/supabase/supabase-host.shared";

function runtimeEnv(vercelEnv: string): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", VERCEL_ENV: vercelEnv };
}

describe("resolveHororaRuntimeSupabaseUrl", () => {
  it("never lets Production call the staging Supabase host", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        runtimeEnv("production")
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(undefined, runtimeEnv("production"))
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
  });

  it("keeps a non-production configured URL", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        runtimeEnv("preview")
      )
    ).toBe(`https://${HORORA_STAGING_SUPABASE_HOST}`);
  });

  it("does not rewrite a preview URL onto the production database", () => {
    const placeholder = "https://preview-host-not-configured.example";
    expect(
      resolveHororaRuntimeSupabaseUrl(placeholder, runtimeEnv("preview"))
    ).toBe(placeholder);
    expect(
      resolveHororaRuntimeSupabaseUrl(placeholder, runtimeEnv("preview"))
    ).not.toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("", runtimeEnv("preview"))
    ).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL");
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("   ", runtimeEnv("preview"))
    ).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL");
  });

  it("refuses an unknown Production Supabase host", () => {
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(
        "https://example.supabase.co",
        runtimeEnv("production")
      )
    ).toThrow("Production HORORA refused unknown Supabase host");
  });
});
