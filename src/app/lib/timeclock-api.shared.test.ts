import { describe, expect, it } from "vitest";
import {
  isAuthorizationRequestType,
  normalizePhoneNumber,
  normalizePhoneToTwilioE164,
} from "./timeclock-api.shared";

describe("timeclock-api.shared", () => {
  it("normalizePhoneNumber retire le formatage", () => {
    expect(normalizePhoneNumber("+1 (514) 555-0100")).toBe("+15145550100");
    expect(normalizePhoneNumber(undefined)).toBe("");
  });

  it("normalizePhoneToTwilioE164 ajoute +1 aux numeros nord-americains", () => {
    expect(normalizePhoneToTwilioE164("514 555-0100")).toBe("+15145550100");
    expect(normalizePhoneToTwilioE164("+15145550100")).toBe("+15145550100");
    expect(normalizePhoneToTwilioE164("15145550100")).toBe("+15145550100");
    expect(normalizePhoneToTwilioE164("")).toBe("");
  });

  it("isAuthorizationRequestType accepte les types connus", () => {
    expect(isAuthorizationRequestType("early_start")).toBe(true);
    expect(isAuthorizationRequestType("invalid")).toBe(false);
  });
});
