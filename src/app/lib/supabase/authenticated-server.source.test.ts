import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("authenticated commissions write paths — source defense", () => {
  it("authenticated client never uses service role key", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/lib/supabase/authenticated-server.ts"),
      "utf8"
    );
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY|PUBLISHABLE_KEY/);
    expect(source).toMatch(/Authorization:\s*`Bearer \$\{token\}`/);
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/createAdminSupabaseClient/);
  });

  it("requireCommissionsAccess returns JWT-scoped supabase client", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/direction/commissions/_lib.ts"),
      "utf8"
    );
    expect(source).toMatch(/createAuthenticatedServerSupabaseClient/);
    expect(source).not.toMatch(
      /return \{ ok: true as const, user, role, supabase: createAdminSupabaseClient\(\)/
    );
  });

  it("human write routes do not call createAdminSupabaseClient for table writes", () => {
    const files = [
      "src/app/api/direction/commissions/objectives/route.ts",
      "src/app/api/direction/commissions/objectives/[id]/route.ts",
      "src/app/api/direction/commissions/objectives/[id]/recalculate/route.ts",
      "src/app/api/direction/commissions/entries/[id]/route.ts",
    ];
    for (const relative of files) {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      expect(source).not.toMatch(/createAdminSupabaseClient/);
    }
  });

  it("grants route keeps Auth Admin service_role only for getUserById", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/admin/commission-book-access-grants/route.ts"),
      "utf8"
    );
    expect(source).toMatch(/createAdminSupabaseClient/);
    expect(source).toMatch(/auth\.admin\.getUserById/);
    expect(source).toMatch(/assertChauffeurOrganizationAccess/);
    expect(source).toMatch(/requireAdminFinanceCommissionsAccess/);
  });
});
