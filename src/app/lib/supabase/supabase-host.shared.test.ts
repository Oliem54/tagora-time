import { describe, expect, it } from "vitest";
import {
  HORORA_PRODUCTION_SUPABASE_URL,
  HORORA_STAGING_SUPABASE_HOST,
  resolveHororaRuntimeSupabaseUrl,
} from "@/app/lib/supabase/supabase-host.shared";

describe("resolveHororaRuntimeSupabaseUrl", () => {
  it("never lets Production call the staging Supabase host", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        { VERCEL_ENV: "production" }
      )
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
    expect(
      resolveHororaRuntimeSupabaseUrl(undefined, { VERCEL_ENV: "production" })
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
  });

  it("keeps a non-production configured URL", () => {
    expect(
      resolveHororaRuntimeSupabaseUrl(
        `https://${HORORA_STAGING_SUPABASE_HOST}`,
        { VERCEL_ENV: "preview" }
      )
    ).toBe(`https://${HORORA_STAGING_SUPABASE_HOST}`);
  });

  it("refuses an unknown Production Supabase host", () => {
    expect(() =>
      resolveHororaRuntimeSupabaseUrl("https://example.supabase.co", {
        VERCEL_ENV: "production",
      })
    ).toThrow("Production HORORA refused unknown Supabase host");
  });
});
