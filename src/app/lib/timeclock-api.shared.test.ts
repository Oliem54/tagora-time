import { describe, expect, it } from "vitest";
import {
  isAuthorizationRequestType,
  normalizePhoneNumber,
} from "./timeclock-api.shared";

describe("timeclock-api.shared", () => {
  it("normalizePhoneNumber retire le formatage", () => {
    expect(normalizePhoneNumber("+1 (514) 555-0100")).toBe("+15145550100");
    expect(normalizePhoneNumber(undefined)).toBe("");
  });

  it("isAuthorizationRequestType accepte les types connus", () => {
    expect(isAuthorizationRequestType("early_start")).toBe(true);
    expect(isAuthorizationRequestType("invalid")).toBe(false);
  });
});
