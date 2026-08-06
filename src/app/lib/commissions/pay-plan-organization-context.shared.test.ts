import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolvePayPlanOrganizationContext,
  withOrganizationId,
} from "./pay-plan-organization-context.shared";

const ORG_A = "b061dc57-3939-43bc-a04f-17173cb77f15";
const ORG_B = "11111111-1111-4111-8111-111111111111";

describe("resolvePayPlanOrganizationContext", () => {
  it("accepte organization_id URL autorisé", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: ORG_A,
        memberships: [{ organizationId: ORG_A }],
      })
    ).toEqual({ ok: true, organizationId: ORG_A, source: "url" });
  });

  it("refuse organization_id non autorisé (anti cross-tenant)", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: ORG_B,
        memberships: [{ organizationId: ORG_A }],
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("utilise la session lorsque l’URL est absente et la membership active", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: null,
        sessionOrganizationId: ORG_A,
        memberships: [
          { organizationId: ORG_A },
          { organizationId: ORG_B },
        ],
      })
    ).toEqual({ ok: true, organizationId: ORG_A, source: "session" });
  });

  it("refuse une session hors membership", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: null,
        sessionOrganizationId: ORG_B,
        memberships: [{ organizationId: ORG_A }],
      })
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("replie sur l’organisation unique autorisée", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: "",
        sessionOrganizationId: "",
        memberships: [{ organizationId: ORG_A }],
      })
    ).toEqual({
      ok: true,
      organizationId: ORG_A,
      source: "single_membership",
    });
  });

  it("n’arbitre pas entre plusieurs memberships sans URL ni session", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: null,
        sessionOrganizationId: null,
        memberships: [
          { organizationId: ORG_A },
          { organizationId: ORG_B },
        ],
      })
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("erreur contrôlée sans organisation autorisée", () => {
    expect(
      resolvePayPlanOrganizationContext({
        requestedOrganizationId: null,
        memberships: [],
      })
    ).toMatchObject({ ok: false, status: 403 });
  });
});

describe("withOrganizationId", () => {
  it("ajoute organization_id et préserve les ancres", () => {
    expect(
      withOrganizationId("/admin/commissions#commissions-payees", ORG_A)
    ).toBe(
      `/admin/commissions?organization_id=${ORG_A}#commissions-payees`
    );
  });

  it("remplace un organization_id existant", () => {
    expect(
      withOrganizationId(
        `/admin/commissions/plans/results/abc?organization_id=${ORG_B}`,
        ORG_A
      )
    ).toBe(
      `/admin/commissions/plans/results/abc?organization_id=${ORG_A}`
    );
  });

  it("ne modifie pas un href sans organisation valide", () => {
    expect(withOrganizationId("/admin/commissions", "")).toBe(
      "/admin/commissions"
    );
  });
});

describe("navigation / fiche source contracts", () => {
  it("fiche résultat résout l’organisation et propage les liens", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/plans/results/[accrualId]/GenericPayPlanResultClient.tsx"
      ),
      "utf8"
    );
    expect(source).toMatch(/resolvePayPlanOrganizationContext/);
    expect(source).toMatch(/withOrganizationId/);
    expect(source).toMatch(/writePayPlanOrganizationSession/);
    expect(source).toMatch(/ui-page-header-premium-financial/);
    expect(source).toMatch(/PAID_SUCCESS_CARD_TITLE/);
    expect(source).toMatch(/organizationId=\{organizationId\}/);
  });

  it("navigation commissions conserve organization_id", () => {
    const nav = readFileSync(
      join(
        process.cwd(),
        "src/app/components/admin/AdminCommissionsNavigation.tsx"
      ),
      "utf8"
    );
    expect(nav).toMatch(/withOrganizationId/);
    expect(nav).toMatch(/organizationId/);
    const subnav = readFileSync(
      join(
        process.cwd(),
        "src/app/admin/commissions/commission-module-ui.tsx"
      ),
      "utf8"
    );
    expect(subnav).toMatch(/withOrganizationId/);
  });

  it("serveur pay-plan utilise le resolver avec repli sécurisé", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/lib/commissions/generic-pay-plan.server.ts"
      ),
      "utf8"
    );
    expect(source).toMatch(/resolvePayPlanOrganizationContext/);
    expect(source).not.toMatch(
      /resolveRequestedOrganizationId\(\{\s*requestedOrganizationId: input\.requestedOrganizationId/
    );
  });
});
