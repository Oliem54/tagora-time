import { describe, expect, it } from "vitest";
import {
  isProductionTagoraHostname,
  isStagingPreviewHostname,
  isStagingQaMfaBypassAllowed,
  STAGING_QA_SUPABASE_PROJECT_REF,
} from "@/app/lib/auth/mfa.shared";

const STAGING_SUPABASE_URL = `https://${STAGING_QA_SUPABASE_PROJECT_REF}.supabase.co`;
const PREVIEW_HOST = "tagora-time-git-feature-sales-book-grants-oliem54s-projects.vercel.app";

describe("isStagingPreviewHostname", () => {
  it("accepte localhost et 127.0.0.1", () => {
    expect(isStagingPreviewHostname("localhost")).toBe(true);
    expect(isStagingPreviewHostname("127.0.0.1")).toBe(true);
  });

  it("accepte les previews Vercel", () => {
    expect(isStagingPreviewHostname(PREVIEW_HOST)).toBe(true);
  });

  it("refuse tagora.ca et autres domaines", () => {
    expect(isStagingPreviewHostname("tagora.ca")).toBe(false);
    expect(isStagingPreviewHostname("example.com")).toBe(false);
  });
});

describe("isProductionTagoraHostname", () => {
  it("détecte tagora.ca et sous-domaines", () => {
    expect(isProductionTagoraHostname("tagora.ca")).toBe(true);
    expect(isProductionTagoraHostname("app.tagora.ca")).toBe(true);
  });
});

describe("isStagingQaMfaBypassAllowed", () => {
  it("autorise admin/direction sur preview staging", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: PREVIEW_HOST,
      })
    ).toBe(true);
    expect(
      isStagingQaMfaBypassAllowed({
        role: "direction",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "localhost",
      })
    ).toBe(true);
  });

  it("refuse tagora.ca même avec Supabase staging", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "tagora.ca",
      })
    ).toBe(false);
  });

  it("refuse un autre projet Supabase", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: "https://other-project.supabase.co",
        hostname: PREVIEW_HOST,
      })
    ).toBe(false);
  });

  it("ne change pas le comportement employé", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "employe",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: PREVIEW_HOST,
      })
    ).toBe(false);
  });

  it("refuse un hôte hors localhost / vercel preview", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "random.example.com",
      })
    ).toBe(false);
  });
});
