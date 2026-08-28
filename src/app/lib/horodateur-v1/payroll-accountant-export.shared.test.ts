import { describe, expect, it } from "vitest";
import {
  buildPayrollAccountantSnapshot,
} from "./payroll-accountant-snapshot.shared";
import {
  buildPayrollAccountantCsvRows,
  buildPayrollAccountantPdfBytes,
  escapeCsvCell,
  formatPayrollHours,
  guardCsvFormulaInjection,
  parsePayrollAccountantCsvFrCa,
  payrollAccountantExportFileStem,
  PAYROLL_ACCOUNTANT_CSV_HEADERS,
  PAYROLL_CSV_FIELD_SEPARATOR,
  serializePayrollAccountantCsv,
} from "./payroll-accountant-export.shared";
import type {
  HorodateurPhase1EmployeeProfile,
  HorodateurPhase1ShiftRecord,
} from "./types";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CYCLE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const TENANT = {
  organizationId: ORG,
  organizationCompanyId: COMPANY,
  organizationName: "Org QA",
  organizationCompanyName: "Oliem Solutions",
  cycleId: CYCLE,
  timezone: "America/Toronto",
  periodStart: "2026-08-10",
  periodEnd: "2026-08-23",
  cycleKind: "recurring" as const,
};

function profile(): HorodateurPhase1EmployeeProfile {
  return {
    employeeId: 7,
    organizationId: ORG,
    organizationCompanyId: COMPANY,
    authUserId: null,
    fullName: "Yves Test",
    email: null,
    phoneNumber: null,
    active: true,
    scheduleActive: true,
    primaryCompany: "oliem_solutions",
    scheduleStart: "08:00",
    scheduleEnd: "17:00",
    scheduledWorkDays: null,
    plannedWeeklyHours: 40,
    pausePaid: false,
    pauseMinutes: 15,
    lunchPaid: false,
    lunchMinutes: 30,
    expectedBreaksCount: null,
    toleranceBeforeStartMinutes: 0,
    toleranceAfterEndMinutes: 0,
    maxShiftMinutes: 720,
    smsAlertQuartDebut: false,
    smsAlertQuartFin: false,
    smsAlertPauseDebut: false,
    smsAlertPauseFin: false,
    smsAlertDinnerDebut: false,
    smsAlertDinnerFin: false,
    smsAlertDepartTerrain: false,
    smsAlertArriveeTerrain: false,
    smsAlertSortie: false,
    smsAlertRetour: false,
    alertEmailEnabled: false,
    alertSmsEnabled: false,
    isDirectionAlertRecipient: false,
    weeklyScheduleConfig: null,
    canWorkForOliemSolutions: true,
    canWorkForTitanProduitsIndustriels: false,
  };
}

function shift(
  partial: Partial<HorodateurPhase1ShiftRecord> & Pick<
    HorodateurPhase1ShiftRecord,
    "id" | "work_date"
  >
): HorodateurPhase1ShiftRecord {
  return {
    employee_id: 7,
    organization_id: ORG,
    organization_company_id: COMPANY,
    week_start_date: "",
    company_context: "oliem_solutions",
    shift_start_at: `${partial.work_date}T12:00:00.000Z`,
    shift_end_at: `${partial.work_date}T20:00:00.000Z`,
    gross_minutes: 480,
    paid_break_minutes: 0,
    unpaid_break_minutes: 15,
    unpaid_lunch_minutes: 30,
    worked_minutes: 480,
    payable_minutes: 480,
    anomalies_count: 0,
    status: "valide",
    last_recomputed_at: `${partial.work_date}T20:01:00.000Z`,
    ...partial,
  };
}

function snapshot() {
  return buildPayrollAccountantSnapshot({
    tenant: TENANT,
    profiles: [profile()],
    shifts: [shift({ id: "s1", work_date: "2026-08-10" })],
    events: [
      {
        id: "e1",
        employee_id: 7,
        organization_id: ORG,
        organization_company_id: COMPANY,
        work_date: "2026-08-10",
        week_start_date: "2026-08-10",
        event_type: "correction",
        occurred_at: "2026-08-10T12:00:00.000Z",
        status: "approuve",
        is_manual_correction: true,
        notes: "=CMD()",
      },
      {
        id: "e2",
        employee_id: 7,
        organization_id: ORG,
        organization_company_id: COMPANY,
        work_date: "2026-08-10",
        week_start_date: "2026-08-10",
        event_type: "anomalie",
        occurred_at: "2026-08-10T12:05:00.000Z",
        status: "approuve",
        is_manual_correction: false,
        notes: "45.501700, -73.567300 gps accuracy=12",
      },
      {
        id: "e3",
        employee_id: 7,
        organization_id: ORG,
        organization_company_id: COMPANY,
        work_date: "2026-08-10",
        week_start_date: "2026-08-10",
        event_type: "anomalie",
        occurred_at: "2026-08-10T12:06:00.000Z",
        status: "approuve",
        is_manual_correction: false,
        notes: "Correction entrée retard autorisée",
      },
    ],
    exceptions: [],
  });
}

describe("payroll accountant CSV and PDF export", () => {
  it("formats canonical hours deterministically", () => {
    expect(formatPayrollHours(480)).toBe("8.00");
    expect(formatPayrollHours(90)).toBe("1.50");
  });

  it("guards CSV formula injection and escapes quotes", () => {
    expect(guardCsvFormulaInjection("=1+1")).toBe("'=1+1");
    expect(guardCsvFormulaInjection("+profit")).toBe("'+profit");
    expect(guardCsvFormulaInjection("-1")).toBe("'-1");
    expect(guardCsvFormulaInjection("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell('said "hello", then left')).toBe(
      '"said ""hello"", then left"'
    );
  });

  it("builds a deterministic UTF-8 CSV with Excel fr-CA columns and no GPS leakage", () => {
    const built = snapshot();
    const first = serializePayrollAccountantCsv(built);
    const second = serializePayrollAccountantCsv(built);
    expect(first).toBe(second);
    expect(first.startsWith("\uFEFF")).toBe(true);
    expect(first).toContain(PAYROLL_CSV_FIELD_SEPARATOR);
    expect(first).toContain("journée");
    expect(first).toContain("sous-total semaine");
    expect(first).toContain("total employé");
    expect(first).toContain("total entreprise");
    expect(first).toContain("Yves Test");
    expect(first).toContain("Correction entrée retard autorisée");
    expect(first).toContain("'=CMD()");
    expect(first).not.toContain("45.501700");
    expect(first).not.toContain("gps");
    expect(first).not.toMatch(/2026-08-10T12:00:00/);
    const parsed = parsePayrollAccountantCsvFrCa(first);
    expect(parsed[0]).toEqual([...PAYROLL_ACCOUNTANT_CSV_HEADERS]);
    expect(parsed[0]?.length).toBe(PAYROLL_ACCOUNTANT_CSV_HEADERS.length);
    expect(parsed.slice(1).every((row) => row.length === parsed[0]?.length)).toBe(
      true
    );
    expect(first.split("\r\n")[0]?.split(",").length).toBe(1);
    const rows = buildPayrollAccountantCsvRows(built);
    expect(rows[0]?.[0]).toBe("Organisation");
    expect(rows.some((row) => row[6] === "journée")).toBe(true);
    expect(built.payload.employees[0]?.weeks[0]?.days[0]?.notes.join(" ")).toContain(
      "45.501700"
    );
    expect(payrollAccountantExportFileStem(built.payload)).toBe(
      "horora-rapport-comptable-oliem-solutions-2026-08-10-2026-08-23"
    );
  });

  it("generates a non-empty PDF with HORORA identity, local dates and no technical GPS", () => {
    const pdf = buildPayrollAccountantPdfBytes(snapshot(), {
      status: "issued",
      revision: 1,
      issuedAt: "2026-08-24T12:00:00.000Z",
    });
    expect(pdf.byteLength).toBeGreaterThan(200);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("HORORA par TAGORA");
    expect(text).toContain("Oliem Solutions");
    expect(text).not.toContain("Hash source");
    expect(text).not.toContain("45.501700");
    expect(text).not.toContain("2026-08-10T12:00:00.000Z");
    expect(text).not.toContain("22222222-2222-4222-8222-222222222222");
  });
});
