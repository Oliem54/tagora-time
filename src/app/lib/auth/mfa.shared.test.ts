import { describe, expect, it } from "vitest";
import {
  isProductionTagoraHostname,
  isStagingPreviewHostname,
  isStagingQaMfaBypassAllowed,
  readRequestHostname,
  shouldBlockJwtAal1ForMandatoryMfaRole,
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

  it("accepte le staging Time canonique", () => {
    expect(isStagingPreviewHostname("time.staging.tagora.ca")).toBe(true);
  });

  it("refuse Production Time et domaines hors staging", () => {
    expect(isStagingPreviewHostname("time.tagora.ca")).toBe(false);
    expect(isStagingPreviewHostname("tagora.ca")).toBe(false);
    expect(isStagingPreviewHostname("example.com")).toBe(false);
  });
});

describe("isProductionTagoraHostname", () => {
  it("détecte uniquement time.tagora.ca comme Production Time", () => {
    expect(isProductionTagoraHostname("time.tagora.ca")).toBe(true);
    expect(isProductionTagoraHostname("TIME.tagora.ca")).toBe(true);
  });

  it("ne traite pas staging, Nexus, previews ni sous-domaines inconnus comme Production", () => {
    expect(isProductionTagoraHostname("time.staging.tagora.ca")).toBe(false);
    expect(isProductionTagoraHostname("app.tagora.ca")).toBe(false);
    expect(isProductionTagoraHostname("tagora.ca")).toBe(false);
    expect(isProductionTagoraHostname("ops.tagora.ca")).toBe(false);
    expect(isProductionTagoraHostname(PREVIEW_HOST)).toBe(false);
    expect(isProductionTagoraHostname("localhost")).toBe(false);
  });
});

describe("isStagingQaMfaBypassAllowed", () => {
  it("autorise admin/direction seulement en local ou staging Time canonique", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: PREVIEW_HOST,
      })
    ).toBe(false);
    expect(
      isStagingQaMfaBypassAllowed({
        role: "direction",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "localhost",
      })
    ).toBe(true);
  });

  it("autorise le staging Time canonique avec Supabase staging", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "time.staging.tagora.ca",
      })
    ).toBe(true);
  });

  it("refuse Production Time même avec Supabase staging", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "time.tagora.ca",
      })
    ).toBe(false);
  });

  it("refuse tagora.ca / Nexus même avec Supabase staging", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "tagora.ca",
      })
    ).toBe(false);
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "app.tagora.ca",
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

  it("refuse un hôte hors localhost / vercel preview / staging Time", () => {
    expect(
      isStagingQaMfaBypassAllowed({
        role: "admin",
        supabaseUrl: STAGING_SUPABASE_URL,
        hostname: "random.example.com",
      })
    ).toBe(false);
  });
});

describe("readRequestHostname", () => {
  it("priorise x-forwarded-host puis host", () => {
    const forwarded = new Headers({
      "x-forwarded-host": "tagora-time-git-feature.vercel.app",
      host: "localhost:3000",
    });
    expect(readRequestHostname(forwarded)).toBe("tagora-time-git-feature.vercel.app");

    const hostOnly = new Headers({ host: "127.0.0.1:3000" });
    expect(readRequestHostname(hostOnly)).toBe("127.0.0.1");
  });
});

describe("shouldBlockJwtAal1ForMandatoryMfaRole", () => {
  it("bloque admin AAL1 sur une Preview Vercel", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: PREVIEW_HOST,
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(true);
  });

  it("ne bloque pas admin sur staging Time canonique en aal1 (Supabase staging)", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: "time.staging.tagora.ca",
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(false);
  });

  it("bloque admin sur Production Time en aal1", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: "time.tagora.ca",
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(true);
  });

  it("bloque admin sur tagora.ca / Nexus en aal1 (pas de bypass staging)", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: "tagora.ca",
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(true);
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: "app.tagora.ca",
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(true);
  });

  it("bloque admin preview si autre projet Supabase", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "admin",
        isExplicitlyAal1Only: true,
        hostname: PREVIEW_HOST,
        supabaseUrl: "https://other-project.supabase.co",
      })
    ).toBe(true);
  });

  it("ne bloque pas employé en aal1", () => {
    expect(
      shouldBlockJwtAal1ForMandatoryMfaRole({
        role: "employe",
        isExplicitlyAal1Only: true,
        hostname: PREVIEW_HOST,
        supabaseUrl: STAGING_SUPABASE_URL,
      })
    ).toBe(false);
  });
});
