import { describe, expect, it } from "vitest";
import {
  HORORA_PRODUCTION_SUPABASE_URL,
  HORORA_STAGING_SUPABASE_HOST,
  HORORA_STAGING_SUPABASE_URL,
  resolveHororaRuntimeSupabaseUrl,
} from "@/app/lib/supabase/supabase-host.shared";

function runtimeEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...extra };
}

describe("resolveHororaRuntimeSupabaseUrl", () => {
  it("keeps tagora-time-staging on Staging Supabase when VERCEL_ENV is production", () => {
    const stagingUrl = `https://${HORORA_STAGING_SUPABASE_HOST}`;
    expect(
      resolveHororaRuntimeSupabaseUrl(
        HORORA_PRODUCTION_SUPABASE_URL,
        runtimeEnv({
          VERCEL_ENV: "production",
          VERCEL_PROJECT_NAME: "tagora-time-staging",
        })
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(
        stagingUrl,
        runtimeEnv({
          VERCEL_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://tagora-time-staging.vercel.app",
        })
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(
        undefined,
        runtimeEnv({
          VERCEL_ENV: "production",
          VERCEL_URL: "tagora-time-staging-5w5q3u2do-oliem54s-projects.vercel.app",
        })
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
  });

  it("keeps time.tagora.ca and project tagora-time on Production Supabase", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        runtimeEnv({
          VERCEL_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://time.tagora.ca",
        })
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(
        undefined,
        runtimeEnv({
          VERCEL_ENV: "production",
          VERCEL_PROJECT_NAME: "tagora-time",
        })
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
  });

  it("does not treat VERCEL_ENV=production alone as Production", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        runtimeEnv({ VERCEL_ENV: "production" })
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(null, runtimeEnv({ VERCEL_ENV: "production" }))
    ).toThrow("HORORA refused ambiguous Supabase target");
  });

  it("keeps an explicit Staging URL outside Vercel", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        runtimeEnv({ VERCEL_ENV: "preview" })
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
  });

  it("refuses an unknown host instead of calling Production", () => {
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(
        "https://example.supabase.co",
        runtimeEnv({ VERCEL_ENV: "production" })
      )
    ).toThrow("Production HORORA refused unknown Supabase host");
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(
        HORORA_PRODUCTION_SUPABASE_URL,
        runtimeEnv({
          VERCEL_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://unknown.example",
        })
      )
    ).toThrow("Production HORORA refused unknown Supabase host");
  });

  it("refuses conflicting Staging and Production signals", () => {
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(
        HORORA_STAGING_SUPABASE_URL,
        runtimeEnv({
          VERCEL_ENV: "production",
          VERCEL_PROJECT_NAME: "tagora-time-staging",
          NEXT_PUBLIC_APP_URL: "https://time.tagora.ca",
        })
      )
    ).toThrow("HORORA refused ambiguous Supabase target");
  });
});
