import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260927140000_commission_sale_lines.sql"),
  "utf8"
).toLowerCase();

describe("commission sale lines migration", () => {
  it("adds an append-only ledger without deleting existing commission data", () => {
    expect(sql).toContain("create table if not exists public.commission_sale_lines");
    expect(sql).toContain("kind in ('sale', 'adjustment', 'correction')");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("truncate");
  });
});
