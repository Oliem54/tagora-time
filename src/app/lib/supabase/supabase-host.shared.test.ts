import { describe, expect, it } from "vitest";
import {
  HORORA_PRODUCTION_SUPABASE_URL,
  HORORA_PRODUCTION_VERCEL_PROJECT_HOST,
  HORORA_STAGING_SUPABASE_HOST,
  HORORA_STAGING_SUPABASE_URL,
  HORORA_STAGING_VERCEL_PROJECT_HOST,
  resolveHororaRuntimeSupabaseUrl,
} from "@/app/lib/supabase/supabase-host.shared";

const STAGING_PROJECT_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_PRODUCTION_URL: HORORA_STAGING_VERCEL_PROJECT_HOST,
};

const PRODUCTION_PROJECT_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_PRODUCTION_URL: "time.tagora.ca",
};

describe("resolveHororaRuntimeSupabaseUrl", () => {
  it("HORORA_STAGING_PROJECT_USES_STAGING_SUPABASE", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        STAGING_PROJECT_ENV
      )
    ).toBe(`https://${HORORA_STAGING_SUPABASE_HOST}`);
    expect(
      resolveHororaRuntimeSupabaseUrl("development", {
        ...STAGING_PROJECT_ENV,
        NEXT_PUBLIC_APP_URL: "development",
      })
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl("", {
        ...STAGING_PROJECT_ENV,
        VERCEL_PROJECT_PRODUCTION_URL: undefined,
        VERCEL_URL: "tagora-time-staging-abc123-oliem54s-projects.vercel.app",
      })
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(HORORA_PRODUCTION_SUPABASE_URL, {
        NODE_ENV: "test",
        VERCEL: "1",
        VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://time.staging.tagora.ca",
        VERCEL_PROJECT_PRODUCTION_URL: HORORA_PRODUCTION_VERCEL_PROJECT_HOST,
      })
    ).toBe(HORORA_STAGING_SUPABASE_URL);
  });

  it("HORORA_PRODUCTION_PROJECT_USES_PRODUCTION_SUPABASE", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        HORORA_PRODUCTION_SUPABASE_URL,
        PRODUCTION_PROJECT_ENV
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl("", {
        ...PRODUCTION_PROJECT_ENV,
        VERCEL_PROJECT_PRODUCTION_URL: HORORA_PRODUCTION_VERCEL_PROJECT_HOST,
      })
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl("", {
        NODE_ENV: "test",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "tagora-time-oliem54s-projects.vercel.app",
      })
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
  });

  it("STAGING_CANNOT_FALL_THROUGH_TO_PRODUCTION", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        HORORA_PRODUCTION_SUPABASE_URL,
        STAGING_PROJECT_ENV
      )
    ).toBe(HORORA_STAGING_SUPABASE_URL);
    expect(resolveHororaRuntimeSupabaseUrl("", STAGING_PROJECT_ENV)).toBe(
      HORORA_STAGING_SUPABASE_URL
    );
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        { NODE_ENV: "test", VERCEL_ENV: "production" }
      )
    ).toBe(`https://${HORORA_STAGING_SUPABASE_HOST}`);
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("", {
        NODE_ENV: "test",
        VERCEL_ENV: "production",
      })
    ).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL");
  });

  it("PRODUCTION_CANNOT_USE_STAGING_SUPABASE", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        PRODUCTION_PROJECT_ENV
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(resolveHororaRuntimeSupabaseUrl("", PRODUCTION_PROJECT_ENV)).toBe(
      HORORA_PRODUCTION_SUPABASE_URL
    );
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        {
          ...PRODUCTION_PROJECT_ENV,
          VERCEL_PROJECT_PRODUCTION_URL: undefined,
          NEXT_PUBLIC_APP_URL: "https://time.tagora.ca",
        }
      )
    ).not.toContain(HORORA_STAGING_SUPABASE_HOST);
  });

  it("UNKNOWN_HOST_FAILS_CLOSED", () => {
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("https://example.supabase.co", {
        NODE_ENV: "test",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "unknown.example.com",
      })
    ).toThrow("HORORA refused unknown Supabase host");
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("https://example.supabase.co", STAGING_PROJECT_ENV)
    ).toThrow("Staging HORORA refused unknown Supabase host");
    expect(() =>
      resolveHororaRuntimeSupabaseUrl(
        "https://example.supabase.co",
        PRODUCTION_PROJECT_ENV
      )
    ).toThrow("Production HORORA refused unknown Supabase host");
  });

  it("keeps a local configured URL when no Vercel project is present", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl("https://example.supabase.co", {
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      })
    ).toBe("https://example.supabase.co");
    expect(
      resolveHororaRuntimeSupabaseUrl("development", {
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      })
    ).toBe("development");
  });
});
