import type {
  PayrollAccountantSnapshotPayload,
  PayrollAccountantSnapshotResult,
  PayrollCompletenessStatus,
} from "./payroll-accountant-snapshot.shared";

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const UTF8_BOM = "\uFEFF";
export const PAYROLL_CSV_FIELD_SEPARATOR = ";";
export const PAYROLL_DISPLAY_TIMEZONE = "America/Toronto";

export const PAYROLL_ACCOUNTANT_CSV_HEADERS = [
  "Organisation",
  "Entreprise",
  "Date de début",
  "Date de fin",
  "Fuseau",
  "Statut de complétude",
  "Ligne",
  "Identifiant employé",
  "Employé",
  "Semaine début",
  "Semaine fin",
  "Journée",
  "Entrée",
  "Sortie",
  "Heures régulières",
  "Heures supplémentaires",
  "Heures payables",
  "Minutes pause payée",
  "Minutes pause non payée",
  "Minutes dîner non payé",
  "Incomplet",
  "Corrections",
  "Notes",
] as const;

export type PayrollAccountantExportMeta = {
  reportId?: string | null;
  revision?: number | null;
  status?: "draft" | "issued" | "preview";
  issuedAt?: string | null;
};

export function formatPayrollHours(minutes: number) {
  const value = Number.isFinite(minutes) ? minutes : 0;
  return (value / 60).toFixed(2);
}

export function payrollCompletenessLabel(status: PayrollCompletenessStatus) {
  if (status === "complete") return "Complet";
  if (status === "forced") return "Forcé";
  return "Bloqué (incomplet)";
}

export function payrollReportStatusLabel(status: "draft" | "issued" | "preview") {
  if (status === "issued") return "Émis";
  if (status === "draft") return "Brouillon";
  return "Aperçu";
}

export function formatPayrollDateFrCa(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = dateOnly
    ? new Date(
        Date.UTC(
          Number(dateOnly[1]),
          Number(dateOnly[2]) - 1,
          Number(dateOnly[3]),
          12
        )
      )
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "long",
    timeZone: PAYROLL_DISPLAY_TIMEZONE,
  }).format(date);
}

export function formatPayrollDateTimeFrCa(
  value: string | null | undefined,
  timezone = PAYROLL_DISPLAY_TIMEZONE
) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone || PAYROLL_DISPLAY_TIMEZONE,
  }).format(date);
}

export function isTechnicalAccountantNote(value: string) {
  const text = value.trim();
  if (!text) return true;
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return true;
  if (/\b(lat(itude)?|lng|lon(gitude)?|gps|accuracy|altitude|telemetry|geojson|wkt|srid|punch_zone)\b/i.test(text)) {
    return true;
  }
  if (/\b[-+]?\d{1,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}\b/.test(text)) {
    return true;
  }
  return false;
}

export function sanitizePayrollAccountantNote(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text || isTechnicalAccountantNote(text)) return "";
  return text;
}

export function collectPayrollAccountantHumanNotes(
  notes: Array<string | null | undefined>
) {
  return notes
    .map((note) => sanitizePayrollAccountantNote(note))
    .filter(Boolean);
}

export function slugPayrollExportSegment(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "entreprise";
}

export function payrollAccountantExportFileStem(
  payload: PayrollAccountantSnapshotPayload
) {
  return [
    "horora-rapport-comptable",
    slugPayrollExportSegment(payload.organizationCompanyName),
    payload.periodStart,
    payload.periodEnd,
  ].join("-");
}

export function guardCsvFormulaInjection(value: string) {
  if (!value) return value;
  return CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const raw =
    value === null || value === undefined ? "" : String(value);
  const guarded = guardCsvFormulaInjection(raw);
  if (/[";\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function buildPayrollAccountantCsvRows(
  snapshot: PayrollAccountantSnapshotResult,
  meta: PayrollAccountantExportMeta = {}
) {
  void meta;
  const payload = snapshot.payload;
  const timezone = payload.timezone || PAYROLL_DISPLAY_TIMEZONE;
  const rows: string[][] = [[...PAYROLL_ACCOUNTANT_CSV_HEADERS]];

  const base = [
    payload.organizationName ?? payload.organizationId,
    payload.organizationCompanyName ?? payload.organizationCompanyId,
    formatPayrollDateFrCa(payload.periodStart),
    formatPayrollDateFrCa(payload.periodEnd),
    timezone,
    payrollCompletenessLabel(payload.completenessStatus),
  ];

  for (const employee of payload.employees) {
    for (const week of employee.weeks) {
      for (const day of week.days) {
        const humanNotes = collectPayrollAccountantHumanNotes([
          ...day.corrections.map((item) => item.notes),
          ...day.notes,
        ]);
        rows.push([
          ...base,
          "journée",
          String(employee.employeeId),
          employee.employeeName ?? "",
          formatPayrollDateFrCa(week.weekStart),
          formatPayrollDateFrCa(week.weekEnd),
          formatPayrollDateFrCa(day.workDate),
          formatPayrollDateTimeFrCa(day.punchInAt, timezone),
          formatPayrollDateTimeFrCa(day.punchOutAt, timezone),
          formatPayrollHours(day.regularMinutes),
          formatPayrollHours(day.overtimeMinutes),
          formatPayrollHours(day.payableMinutes),
          String(day.paidBreakMinutes),
          String(day.unpaidBreakMinutes),
          String(day.unpaidLunchMinutes),
          day.hasIncompletePunch ? "oui" : "non",
          collectPayrollAccountantHumanNotes(
            day.corrections.map((item) => item.notes ?? "Correction")
          ).join(" | "),
          humanNotes.join(" | "),
        ]);
      }
      rows.push([
        ...base,
        "sous-total semaine",
        String(employee.employeeId),
        employee.employeeName ?? "",
        formatPayrollDateFrCa(week.weekStart),
        formatPayrollDateFrCa(week.weekEnd),
        "",
        "",
        "",
        formatPayrollHours(week.regularMinutes),
        formatPayrollHours(week.overtimeMinutes),
        formatPayrollHours(week.payableMinutes),
        String(week.paidBreakMinutes),
        String(week.unpaidBreakMinutes),
        String(week.unpaidLunchMinutes),
        "",
        "",
        "",
      ]);
    }
    rows.push([
      ...base,
      "total employé",
      String(employee.employeeId),
      employee.employeeName ?? "",
      "",
      "",
      "",
      "",
      "",
      formatPayrollHours(employee.totals.regularMinutes),
      formatPayrollHours(employee.totals.overtimeMinutes),
      formatPayrollHours(employee.totals.payableMinutes),
      String(employee.totals.paidBreakMinutes),
      String(employee.totals.unpaidBreakMinutes),
      String(employee.totals.unpaidLunchMinutes),
      "",
      collectPayrollAccountantHumanNotes(
        employee.exceptions.map((item) => item.reasonLabel || item.exceptionType)
      ).join(" | "),
      "",
    ]);
  }

  rows.push([
    ...base,
    "total entreprise",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    formatPayrollHours(payload.companyTotals.regularMinutes),
    formatPayrollHours(payload.companyTotals.overtimeMinutes),
    formatPayrollHours(payload.companyTotals.payableMinutes),
    String(payload.companyTotals.paidBreakMinutes),
    String(payload.companyTotals.unpaidBreakMinutes),
    String(payload.companyTotals.unpaidLunchMinutes),
    "",
    "",
    `Employés = ${payload.companyTotals.employeeCount}`,
  ]);

  return rows;
}

export function serializePayrollAccountantCsv(
  snapshot: PayrollAccountantSnapshotResult,
  meta: PayrollAccountantExportMeta = {}
) {
  const body = buildPayrollAccountantCsvRows(snapshot, meta)
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(PAYROLL_CSV_FIELD_SEPARATOR))
    .join("\r\n");
  return `${UTF8_BOM}${body}\r\n`;
}

export function parsePayrollAccountantCsvFrCa(csv: string) {
  const text = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        quoted = false;
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === PAYROLL_CSV_FIELD_SEPARATOR) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(cell);
      if (row.some((value) => value.length > 0) || rows.length === 0) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.length > 0));
}

const WINANSI: Record<string, number> = {
  À: 0xc0,
  Â: 0xc2,
  Ä: 0xc4,
  Ç: 0xc7,
  È: 0xc8,
  É: 0xc9,
  Ê: 0xca,
  Ë: 0xcb,
  Î: 0xce,
  Ï: 0xcf,
  Ô: 0xd4,
  Ù: 0xd9,
  Û: 0xdb,
  Ü: 0xdc,
  à: 0xe0,
  â: 0xe2,
  ä: 0xe4,
  ç: 0xe7,
  è: 0xe8,
  é: 0xe9,
  ê: 0xea,
  ë: 0xeb,
  î: 0xee,
  ï: 0xef,
  ô: 0xf4,
  ù: 0xf9,
  û: 0xfb,
  ü: 0xfc,
  œ: 0x9c,
  Œ: 0x8c,
  "’": 0x92,
  "«": 0xab,
  "»": 0xbb,
};

function pdfEscape(text: string) {
  let out = "";
  for (const char of text) {
    if (char === "\\" || char === "(" || char === ")") {
      out += `\\${char}`;
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    if (code < 128) {
      out += char;
      continue;
    }
    const mapped = WINANSI[char];
    if (mapped !== undefined) {
      out += `\\${mapped.toString(8).padStart(3, "0")}`;
      continue;
    }
    out += "?";
  }
  return out;
}

function pdfLinesForSnapshot(
  snapshot: PayrollAccountantSnapshotResult,
  meta: PayrollAccountantExportMeta
) {
  const payload = snapshot.payload;
  const timezone = payload.timezone || PAYROLL_DISPLAY_TIMEZONE;
  const status = meta.status ?? "preview";
  const lines: string[] = [
    "HORORA par TAGORA",
    "Rapport comptable de paie",
    `Organisation : ${payload.organizationName ?? payload.organizationId}`,
    `Entreprise : ${payload.organizationCompanyName ?? payload.organizationCompanyId}`,
    `Période : ${formatPayrollDateFrCa(payload.periodStart)} au ${formatPayrollDateFrCa(payload.periodEnd)}`,
    `Fuseau : ${timezone}`,
    `Statut : ${payrollReportStatusLabel(status)} / ${payrollCompletenessLabel(payload.completenessStatus)}`,
    `Révision : ${meta.revision ?? "—"}`,
    `Date d'émission : ${formatPayrollDateTimeFrCa(meta.issuedAt, timezone) || "—"}`,
    "",
  ];

  if (payload.employees.length === 0) {
    lines.push("Aucune heure sur la période sélectionnée.");
  }

  for (const employee of payload.employees) {
    lines.push(`Employé : ${employee.employeeName ?? employee.employeeId}`);
    for (const week of employee.weeks) {
      lines.push(
        `  Semaine ${formatPayrollDateFrCa(week.weekStart)} — ${formatPayrollDateFrCa(week.weekEnd)} | régulier ${formatPayrollHours(week.regularMinutes)} h | extra ${formatPayrollHours(week.overtimeMinutes)} h | pauses ${week.paidBreakMinutes + week.unpaidBreakMinutes + week.unpaidLunchMinutes} min`
      );
      for (const day of week.days) {
        const notes = collectPayrollAccountantHumanNotes([
          ...day.corrections.map((item) => item.notes ?? "Correction"),
          ...day.notes,
        ]).join("; ");
        lines.push(
          `    ${formatPayrollDateFrCa(day.workDate)}  ${formatPayrollDateTimeFrCa(day.punchInAt, timezone) || "—"} -> ${formatPayrollDateTimeFrCa(day.punchOutAt, timezone) || "—"}  R ${formatPayrollHours(day.regularMinutes)}  S ${formatPayrollHours(day.overtimeMinutes)}${day.hasIncompletePunch ? "  INCOMPLET" : ""}${notes ? `  ${notes}` : ""}`
        );
      }
    }
    lines.push(
      `  Total employé : R ${formatPayrollHours(employee.totals.regularMinutes)} h | S ${formatPayrollHours(employee.totals.overtimeMinutes)} h | payable ${formatPayrollHours(employee.totals.payableMinutes)} h`
    );
    lines.push("");
  }

  lines.push(
    `Totaux entreprise : R ${formatPayrollHours(payload.companyTotals.regularMinutes)} h | S ${formatPayrollHours(payload.companyTotals.overtimeMinutes)} h | payable ${formatPayrollHours(payload.companyTotals.payableMinutes)} h | employés ${payload.companyTotals.employeeCount}`
  );
  return lines;
}

function wrapPdfLine(line: string, max = 108) {
  if (line.length <= max) return [line];
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > max) {
    chunks.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function buildPayrollAccountantPdfBytes(
  snapshot: PayrollAccountantSnapshotResult,
  meta: PayrollAccountantExportMeta = {}
) {
  const wrapped = pdfLinesForSnapshot(snapshot, meta).flatMap((line) =>
    wrapPdfLine(line)
  );
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 14;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) {
    pages.push(["HORORA — Rapport comptable de paie"]);
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, index) => 3 + index);
  const contentIds = pages.map((_, index) => 3 + pages.length + index);
  const fontId = 3 + pages.length * 2;
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  for (let i = 0; i < pages.length; i += 1) {
    const footer = `Page ${i + 1} / ${pages.length}`;
    const headerBar =
      "0.094 0.149 0.263 rg 0 760 612 32 re f 0.122 0.475 0.878 rg 0 756 612 4 re f";
    const streamLines = [
      headerBar,
      "BT",
      "/F1 11 Tf",
      "1 1 1 rg",
      `${margin} ${pageHeight - 28} Td`,
      "(HORORA par TAGORA) Tj",
      "0.094 0.149 0.263 rg",
      `/F1 10 Tf`,
      `0 -${28} Td`,
      `${lineHeight} TL`,
      ...pages[i]!.map((line) => `(${pdfEscape(line)}) '`),
      `0 ${margin - (pageHeight - 56 - pages[i]!.length * lineHeight)} Td`,
      `(${pdfEscape(footer)}) '`,
      "ET",
    ];
    const stream = streamLines.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
