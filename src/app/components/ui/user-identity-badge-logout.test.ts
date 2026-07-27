import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const badgeSource = readFileSync(
  join(process.cwd(), "src/app/components/ui/UserIdentityBadge.tsx"),
  "utf8"
);

describe("UserIdentityBadge logout contract", () => {
  it("exposes a visible Déconnexion menu action", () => {
    expect(badgeSource).toContain('aria-label="Déconnexion"');
    expect(badgeSource).toContain('"Déconnexion"');
    expect(badgeSource).toContain('role="menuitem"');
  });

  it("uses the shared sign-out helper and hard-replaces to the login page", () => {
    expect(badgeSource).toContain("signOutToSwitchAccount");
    expect(badgeSource).toContain("window.location.replace");
    expect(badgeSource).toContain("Impossible de se déconnecter");
    expect(badgeSource).toContain("fetchSessionAuthorizationContext");
    expect(badgeSource).toContain("resolvePreferredLogoutRole");
  });

  it("keeps logout keyboard-accessible as a real button", () => {
    expect(badgeSource).toContain('type="button"');
    expect(badgeSource).toContain("disabled={signingOut}");
    expect(badgeSource).toContain("aria-busy={signingOut}");
  });
});
