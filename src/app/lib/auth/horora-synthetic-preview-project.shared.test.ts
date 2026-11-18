import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HORORA_PRODUCTION_SUPABASE_HOST,
  HORORA_STAGING_SUPABASE_HOST,
} from "@/app/lib/supabase/supabase-host.shared";
import { isHororaLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";
import {
  HORORA_SYNTHETIC_PREVIEW_PROJECT_ID,
  isHororaSyntheticPreviewProjectEligible,
} from "@/app/lib/auth/horora-synthetic-preview-project.shared";

const ELIGIBLE = {
  vercelProjectId: HORORA_SYNTHETIC_PREVIEW_PROJECT_ID,
  vercelEnv: "preview",
  hostname: "tagora-horora-premium-2027-mock-qa.vercel.app",
  supabaseUrl: null,
  serviceRoleKeyPresent: false,
} as const;

describe("HORORA synthetic preview project eligibility", () => {
  it("accepts only the empty fictional project", () => {
    expect(isHororaSyntheticPreviewProjectEligible(ELIGIBLE)).toBe(true);
  });

  it("refuses real projects, real databases, and public HORORA hosts", () => {
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        vercelProjectId: "prj_61wz0EOK67aYgjXulY4Tfu1ejDeY",
      })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        vercelProjectId: "prj_VyucPe8kxHo8VMSfwiM75V4IX8du",
      })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({ ...ELIGIBLE, vercelEnv: "production" })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({ ...ELIGIBLE, serviceRoleKeyPresent: true })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        supabaseUrl: `https://${HORORA_STAGING_SUPABASE_HOST}`,
      })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        supabaseUrl: `https://${HORORA_PRODUCTION_SUPABASE_HOST}`,
      })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({ ...ELIGIBLE, hostname: "time.tagora.ca" })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        hostname: "time.staging.tagora.ca",
      })
    ).toBe(false);
    expect(
      isHororaSyntheticPreviewProjectEligible({
        ...ELIGIBLE,
        hostname: "tagora-time-staging.vercel.app",
      })
    ).toBe(false);
  });

  it("does not turn the local fixture on for this public project", () => {
    expect(
      isHororaLocalNexusFixtureEnabled({
        nodeEnv: "production",
        vercelEnv: "preview",
        hostname: "tagora-horora-premium-2027-mock-qa.vercel.app",
        flag: "true",
        supabaseUrl: null,
      })
    ).toBe(false);
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).not.toContain("isHororaSyntheticPreviewProjectEligible");
  });
});
