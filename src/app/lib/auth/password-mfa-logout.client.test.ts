import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const signOut = vi.fn();

vi.mock("@/app/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
  },
}));

vi.mock("@/app/lib/auth/session-cookie", () => ({
  writeBrowserSessionCookie: vi.fn(),
}));

describe("resolvePostLogoutLoginPath / signOutToSwitchAccount", () => {
  beforeEach(() => {
    getUser.mockReset();
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
  });

  it("routes employe to employe login and admin/direction to direction login", async () => {
    const { resolvePostLogoutLoginPath } = await import(
      "@/app/lib/auth/password-mfa.client"
    );
    expect(resolvePostLogoutLoginPath("employe")).toBe("/employe/login");
    expect(resolvePostLogoutLoginPath("direction")).toBe("/direction/login");
    expect(resolvePostLogoutLoginPath("admin")).toBe("/direction/login");
    expect(resolvePostLogoutLoginPath(null)).toBe("/direction/login");
  });

  it("prefers UI/membership role over JWT none for logout redirect", async () => {
    getUser.mockResolvedValue({
      data: { user: { app_metadata: { role: "none" } } },
    });
    const { signOutToSwitchAccount } = await import(
      "@/app/lib/auth/password-mfa.client"
    );
    const path = await signOutToSwitchAccount("employe");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(path).toBe("/employe/login");
  });

  it("falls back to JWT role when no preferred role is provided", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          app_metadata: { role: "admin" },
          user_metadata: {},
        },
      },
    });
    const { signOutToSwitchAccount } = await import(
      "@/app/lib/auth/password-mfa.client"
    );
    const path = await signOutToSwitchAccount();
    expect(path).toBe("/direction/login");
  });

  it("surfaces sign-out failures instead of redirecting", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    signOut.mockResolvedValue({ error: { message: "network" } });
    const { signOutToSwitchAccount } = await import(
      "@/app/lib/auth/password-mfa.client"
    );
    await expect(signOutToSwitchAccount("admin")).rejects.toMatchObject({
      message: "network",
    });
  });
});
