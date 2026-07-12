import { describe, expect, it } from "vitest";
import {
  COMPENSATION_QA_DEFAULTS,
  PRODUCTION_SUPABASE_PROJECT_REF,
  isCompensationQaEventMarker,
  isCompensationQaSimulatorAllowed,
} from "@/app/lib/commissions/compensation-qa.shared";
import { STAGING_QA_SUPABASE_PROJECT_REF } from "@/app/lib/auth/mfa.shared";

const STAGING_URL = `https://${STAGING_QA_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;

describe("isCompensationQaSimulatorAllowed", () => {
  it("autorise localhost + Supabase staging", () => {
    expect(
      isCompensationQaSimulatorAllowed({
        hostname: "localhost",
        supabaseUrl: STAGING_URL,
      })
    ).toBe(true);
  });

  it("refuse production hostname même avec staging URL", () => {
    expect(
      isCompensationQaSimulatorAllowed({
        hostname: "app.tagora.ca",
        supabaseUrl: STAGING_URL,
      })
    ).toBe(false);
  });

  it("refuse le projet Supabase production", () => {
    expect(
      isCompensationQaSimulatorAllowed({
        hostname: "localhost",
        supabaseUrl: PRODUCTION_URL,
      })
    ).toBe(false);
  });

  it("refuse un hôte non staging", () => {
    expect(
      isCompensationQaSimulatorAllowed({
        hostname: "example.com",
        supabaseUrl: STAGING_URL,
      })
    ).toBe(false);
  });
});

describe("isCompensationQaEventMarker", () => {
  it("détecte la référence QA par défaut", () => {
    expect(
      isCompensationQaEventMarker({
        external_reference: COMPENSATION_QA_DEFAULTS.external_reference,
      })
    ).toBe(true);
  });

  it("ignore un événement métier standard", () => {
    expect(
      isCompensationQaEventMarker({
        external_reference: "INV-123",
        label: "Commande client",
        notes: null,
      })
    ).toBe(false);
  });
});
