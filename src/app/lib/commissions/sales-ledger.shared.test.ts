import { describe, expect, it } from "vitest";
import { getLocalWorkDate, HORODATEUR_PHASE1_TIMEZONE } from "@/app/lib/horodateur-v1/rules";
import {
  actorMayUseCompany,
  buildCommissionPayrollCsv,
  businessCalendarDate,
  parseCommissionSalesCsv,
  projectAchievedFromLines,
  resolveSaleCompany,
  unpaidCommissionRemainder,
  validateSaleLineDraft,
} from "./sales-ledger.shared";

describe("commission sales ledger", () => {
  it("rejects a company mismatch between objective and employee", () => {
    const result = resolveSaleCompany({
      objectiveCompany: "oliem_solutions",
      chauffeurCompany: "titan_produits_industriels",
    });
    expect(result.ok).toBe(false);
  });

  it("keeps an actor inside the declared company", () => {
    expect(actorMayUseCompany(["oliem_solutions"], "oliem_solutions")).toBe(true);
    expect(actorMayUseCompany(["oliem_solutions"], "titan_produits_industriels")).toBe(false);
    expect(actorMayUseCompany([], "oliem_solutions")).toBe(true);
  });

  it("folds sales and refuses a negative correction", () => {
    const sale = validateSaleLineDraft({
      draft: {
        kind: "sale",
        saleDate: "2026-09-27",
        reference: "FAC-1",
        label: "Showroom",
        amount: 1500,
        salesCount: 0,
        notes: null,
        correctsLineId: null,
        source: "manual",
      },
      targetType: "amount",
      existing: [],
    });
    expect(sale.ok).toBe(true);
    const correction = projectAchievedFromLines([
      { amount: 100, salesCount: 1 },
      { amount: -150, salesCount: 0 },
    ]);
    expect(correction.ok).toBe(false);
  });

  it("imports a semicolon CSV and rejects a duplicate reference", () => {
    const parsed = parseCommissionSalesCsv(
      "date;reference;libelle;montant;nombre;notes\n2026-09-27;FAC-9;Showroom;1200;0;\n2026-09-27;FAC-9;Doublon;10;0;"
    );
    expect(parsed.ok).toBe(false);
  });

  it("builds a payroll CSV that neutralizes formula injection", () => {
    const csv = buildCommissionPayrollCsv([
      {
        company: "oliem_solutions",
        employee: "=cmd",
        objective: "Septembre",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        status: "Payee",
        salesBasis: 1200,
        amount: 60,
        validatedAt: "2026-09-27T12:00:00.000Z",
        paidAt: "",
        entryId: "entry-1",
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\"'=cmd\"");
    expect(csv).toContain("60.00");
  });

  it("uses the Montreal calendar date through the Toronto IANA zone", () => {
    const instant = new Date("2026-09-27T03:30:00.000Z");
    const montreal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Montreal",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    expect(HORODATEUR_PHASE1_TIMEZONE).toBe("America/Toronto");
    expect(businessCalendarDate(instant)).toBe(montreal);
    expect(getLocalWorkDate(instant)).toBe(montreal);
    expect(montreal).toBe("2026-09-26");
  });

  it("estimates only the unpaid remainder after a payment", () => {
    expect(unpaidCommissionRemainder(150, 100)).toBe(50);
    expect(unpaidCommissionRemainder(100, 100)).toBe(0);
    expect(unpaidCommissionRemainder(80, 100)).toBe(0);
  });
});
