import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_FILES = [
  "src/app/direction/horodateur/rapport-comptable/DirectionPayrollAccountantReportClient.tsx",
  "src/app/direction/horodateur/rapport-comptable/page.tsx",
  "src/app/direction/horodateur/HorodateurDirectionModuleNav.tsx",
  "src/app/lib/horodateur-v1/payroll-accountant-export.shared.ts",
  "src/app/lib/horodateur-v1/payroll-accountant-operational.shared.ts",
];

const SERVER_FILES = [
  "src/app/lib/horodateur-v1/payroll-accountant-operational.server.ts",
  "src/app/api/direction/horodateur/payroll/draft/route.ts",
  "src/app/api/direction/horodateur/payroll/issue/route.ts",
  "src/app/api/direction/horodateur/payroll/context/route.ts",
  "src/app/api/direction/horodateur/payroll/export/csv/route.ts",
  "src/app/api/direction/horodateur/payroll/export/pdf/route.ts",
];

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("payroll accountant client isolation", () => {
  it("keeps service_role and persist RPC out of the browser sources", () => {
    for (const rel of CLIENT_FILES) {
      const source = read(rel);
      expect(source).not.toMatch(/service_role/i);
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("createAdminSupabaseClient");
      expect(source).not.toContain("PAYROLL_ACCOUNTANT_PERSIST_RPC");
      expect(source).not.toContain("persist_horodateur_payroll_accountant_report");
    }
  });

  it("wires confirmation, forced reason, issued lock and distinct print/download", () => {
    const client = read(CLIENT_FILES[0]);
    expect(client).toContain("confirmIssue");
    expect(client).toContain("Confirmer l");
    expect(client).toContain("forceEmitReason");
    expect(client).toContain("Motif");
    expect(client).toContain("issuedLocked");
    expect(client).toContain("blocked_incomplete");
    expect(client).toContain("Télécharger CSV");
    expect(client).toContain("Télécharger PDF");
    expect(client).toContain("Imprimer");
    expect(client).not.toContain("node:crypto");
    expect(client).not.toContain("createHash");
  });

  it("exposes the accountant page in the direction module nav", () => {
    const nav = read(
      "src/app/direction/horodateur/HorodateurDirectionModuleNav.tsx"
    );
    expect(nav).toContain('href: "/direction/horodateur/rapport-comptable"');
    expect(nav).toContain("Rapport comptable");
  });

  it("keeps persist and export routes server-only without accepting a client snapshot", () => {
    for (const rel of SERVER_FILES) {
      const source = read(rel);
      expect(source).not.toContain("body.payload");
      expect(source).not.toContain("body.snapshot");
      expect(source).not.toContain("body.sourceHash");
      expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
    }
    const operational = read(SERVER_FILES[0]);
    expect(operational).toContain('import "server-only"');
    expect(operational).toContain("bindPayrollAccountantPersistSourceHash");
    expect(operational).toContain("createAdminSupabaseClient");
    expect(operational).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
