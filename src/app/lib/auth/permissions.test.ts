import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { hasUserPermission } from "@/app/lib/auth/permissions";

function makeUser(params: {
  role?: string | null;
  permissions?: string[];
}): User {
  return {
    id: "user-test",
    app_metadata: {
      role: params.role ?? null,
      permissions: params.permissions ?? [],
    },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  } as User;
}

describe("hasUserPermission — client/server admin coherence", () => {
  it("accorde commissions à un admin sans permission explicite dans le JWT", () => {
    const admin = makeUser({ role: "admin", permissions: [] });
    expect(hasUserPermission(admin, "commissions")).toBe(true);
  });

  it("refuse commissions à une direction sans permission explicite", () => {
    const direction = makeUser({ role: "direction", permissions: ["terrain"] });
    expect(hasUserPermission(direction, "commissions")).toBe(false);
  });

  it("accorde commissions à une direction avec permission explicite", () => {
    const direction = makeUser({
      role: "direction",
      permissions: ["commissions"],
    });
    expect(hasUserPermission(direction, "commissions")).toBe(true);
  });

  it("refuse commissions à un employé", () => {
    const employe = makeUser({ role: "employe", permissions: [] });
    expect(hasUserPermission(employe, "commissions")).toBe(false);
  });
});
