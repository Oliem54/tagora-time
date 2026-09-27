import { describe, expect, it } from "vitest";
import {
  AUTH_GATE_INIT_FAILURE_MESSAGE,
  resolveAuthGateInitView,
} from "./auth-gate-init.shared";

describe("AuthGate initialization view", () => {
  it("shows the application once the Nexus session is allowed", () => {
    expect(resolveAuthGateInitView({ status: "allowed", initFailed: false })).toBe("allowed");
  });

  it("replaces an unfinished initialization with a retry", () => {
    expect(resolveAuthGateInitView({ status: "checking", initFailed: true })).toBe("retry");
    expect(AUTH_GATE_INIT_FAILURE_MESSAGE).toContain("réessayer");
  });

  it("keeps the loading screen only while initialization is still in progress", () => {
    expect(resolveAuthGateInitView({ status: "checking", initFailed: false })).toBe("loading");
  });
});
