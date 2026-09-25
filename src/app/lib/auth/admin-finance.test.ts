import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  CANONICAL_ADMIN_COMMISSIONS_PATH,
  hasAdminFinanceAccess,
  isAdminFinancePath,
} from "@/app/lib/auth/admin-finance";

function makeUser(role?: string | null): User {
  return {
    id: "user-test",
    app_metadata: role ? { role } : {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

describe("hasAdminFinanceAccess", () => {
  it("grants Nexus admin with an empty JWT stub", () => {
    const stub = makeUser(null);
    expect(hasAdminFinanceAccess(stub, "admin")).toBe(true);
    expect(hasAdminFinanceAccess(stub, "direction")).toBe(false);
    expect(hasAdminFinanceAccess(stub, "employe")).toBe(false);
    expect(hasAdminFinanceAccess(stub)).toBe(false);
  });

  it("keeps JWT admin when no effective role is supplied", () => {
    expect(hasAdminFinanceAccess(makeUser("admin"))).toBe(true);
    expect(hasAdminFinanceAccess(makeUser("direction"))).toBe(false);
  });

  it("maps the historical compensation URL onto the canonical commissions book", () => {
    expect(CANONICAL_ADMIN_COMMISSIONS_PATH).toBe("/admin/commissions");
    expect(isAdminFinancePath("/admin/compensation/ventes")).toBe(true);
    expect(isAdminFinancePath("/admin/commissions")).toBe(true);
  });
});
