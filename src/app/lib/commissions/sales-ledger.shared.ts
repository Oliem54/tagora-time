export const COMMISSION_BUSINESS_TIMEZONE = "America/Toronto";

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const UTF8_BOM = "\uFEFF";
export const COMMISSION_PAYROLL_CSV_SEPARATOR = ";";

export type SaleLineKind = "sale" | "adjustment" | "correction";
export type SaleLineSource = "manual" | "import";

export type SaleLineDraft = {
  kind: SaleLineKind;
  saleDate: string;
  reference: string | null;
  label: string;
  amount: number;
  salesCount: number;
  notes: string | null;
  correctsLineId: string | null;
  source: SaleLineSource;
};

export type ParsedSaleCsvRow = Omit<SaleLineDraft, "kind" | "source" | "correctsLineId">;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function businessCalendarDate(
  value: Date = new Date(),
  timeZone = COMMISSION_BUSINESS_TIMEZONE
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function normalizeCompanyCode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveSaleCompany(input: {
  objectiveCompany: string | null;
  chauffeurCompany: string | null;
}): { ok: true; company: string | null } | { ok: false; error: string } {
  const objectiveCompany = normalizeCompanyCode(input.objectiveCompany);
  const chauffeurCompany = normalizeCompanyCode(input.chauffeurCompany);
  if (objectiveCompany && chauffeurCompany && objectiveCompany !== chauffeurCompany) {
    return {
      ok: false,
      error: "La compagnie de l'objectif ne correspond pas a celle de l'employe.",
    };
  }
  return { ok: true, company: objectiveCompany ?? chauffeurCompany };
}

export function readActorCompanyCodes(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): string[] {
  const codes = new Set<string>();
  for (const source of [user.app_metadata, user.user_metadata]) {
    if (!source) continue;
    for (const key of ["primary_company", "company"] as const) {
      const code = normalizeCompanyCode(
        typeof source[key] === "string" ? source[key] : null
      );
      if (code) codes.add(code);
    }
    const allowed = source.allowed_companies;
    if (Array.isArray(allowed)) {
      for (const item of allowed) {
        const code = normalizeCompanyCode(typeof item === "string" ? item : null);
        if (code) codes.add(code);
      }
    }
  }
  return [...codes];
}

export function actorMayUseCompany(actorCompanies: string[], company: string | null) {
  if (actorCompanies.length === 0) return true;
  const resolved = normalizeCompanyCode(company);
  if (!resolved) return false;
  return actorCompanies.includes(resolved);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function projectAchievedFromLines(
  lines: Array<{ amount: number; salesCount: number }>
):
  | { ok: true; achievedAmount: number; achievedSalesCount: number }
  | { ok: false; error: string } {
  const achievedAmount = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const achievedSalesCount = lines.reduce((sum, line) => sum + line.salesCount, 0);
  if (achievedAmount < 0 || achievedSalesCount < 0) {
    return {
      ok: false,
      error: "L'ajustement rendrait le realise negatif. Corrigez le montant ou le nombre.",
    };
  }
  return { ok: true, achievedAmount, achievedSalesCount };
}

export function validateSaleLineDraft(input: {
  draft: SaleLineDraft;
  targetType: "amount" | "sales_count";
  existing: Array<{ amount: number; salesCount: number }>;
}): { ok: true } | { ok: false; error: string } {
  const { draft, targetType, existing } = input;
  if (!ISO_DATE.test(draft.saleDate)) {
    return { ok: false, error: "Date de vente invalide (AAAA-MM-JJ)." };
  }
  if (!draft.label.trim()) {
    return { ok: false, error: "Le libelle de la vente est requis." };
  }
  if (!Number.isFinite(draft.amount) || !Number.isInteger(draft.salesCount)) {
    return { ok: false, error: "Montant ou nombre de ventes invalide." };
  }
  if (draft.kind === "correction" && !draft.correctsLineId) {
    return { ok: false, error: "Une correction doit viser une ligne existante." };
  }
  if (draft.kind !== "sale" && !draft.notes?.trim()) {
    return { ok: false, error: "Un ajustement ou une correction exige un motif." };
  }
  if (draft.kind === "sale") {
    if (targetType === "amount" && draft.amount <= 0) {
      return { ok: false, error: "Une vente au montant doit etre superieure a zero." };
    }
    if (targetType === "sales_count" && draft.salesCount <= 0) {
      return { ok: false, error: "Une vente doit compter au moins une unite." };
    }
    if (draft.amount < 0 || draft.salesCount < 0) {
      return { ok: false, error: "Une vente ne peut pas etre negative. Utilisez un ajustement." };
    }
  } else if (draft.amount === 0 && draft.salesCount === 0) {
    return { ok: false, error: "L'ajustement doit modifier le montant ou le nombre." };
  }

  const projected = projectAchievedFromLines([
    ...existing,
    { amount: draft.amount, salesCount: draft.salesCount },
  ]);
  if (!projected.ok) return projected;
  return { ok: true };
}

function detectDelimiter(headerLine: string) {
  const semicolons = headerLine.split(";").length;
  const commas = headerLine.split(",").length;
  return semicolons > commas ? ";" : ",";
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const HEADER_ALIASES: Record<string, keyof ParsedSaleCsvRow | "skip"> = {
  date: "saleDate",
  sale_date: "saleDate",
  jour: "saleDate",
  reference: "reference",
  ref: "reference",
  reference_code: "reference",
  label: "label",
  libelle: "label",
  montant: "amount",
  amount: "amount",
  count: "salesCount",
  nombre: "salesCount",
  sales_count: "salesCount",
  notes: "notes",
  note: "notes",
};

function parseNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseCommissionSalesCsv(
  text: string
): { ok: true; rows: ParsedSaleCsvRow[] } | { ok: false; error: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, error: "Le fichier de ventes est vide." };
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = lines[0].split(delimiter).map(normalizeHeader);
  const hasHeader = firstCells.some((cell) => HEADER_ALIASES[cell]);
  const header = hasHeader
    ? firstCells
    : ["date", "reference", "libelle", "montant", "nombre", "notes"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return { ok: false, error: "Aucune ligne de vente a importer." };
  }

  const rows: ParsedSaleCsvRow[] = [];
  const references = new Set<string>();
  for (let index = 0; index < dataLines.length; index += 1) {
    const cells = dataLines[index].split(delimiter).map((cell) => cell.trim());
    const record: Partial<ParsedSaleCsvRow> = {};
    header.forEach((name, cellIndex) => {
      const key = HEADER_ALIASES[name];
      if (!key || key === "skip") return;
      const raw = cells[cellIndex] ?? "";
      if (key === "amount") record.amount = parseNumber(raw);
      else if (key === "salesCount") record.salesCount = Math.trunc(parseNumber(raw));
      else if (key === "reference" || key === "notes") {
        record[key] = raw || null;
      } else if (key === "saleDate" || key === "label") {
        record[key] = raw;
      }
    });

    const row: ParsedSaleCsvRow = {
      saleDate: record.saleDate ?? "",
      reference: record.reference ?? null,
      label: record.label ?? "",
      amount: record.amount ?? 0,
      salesCount: record.salesCount ?? 0,
      notes: record.notes ?? null,
    };
    if (!Number.isFinite(row.amount) || !Number.isFinite(row.salesCount)) {
      return { ok: false, error: `Ligne ${index + 1}: montant ou nombre invalide.` };
    }
    if (!ISO_DATE.test(row.saleDate) || !row.label.trim()) {
      return { ok: false, error: `Ligne ${index + 1}: date et libelle sont requis.` };
    }
    if (row.amount < 0 || row.salesCount < 0) {
      return {
        ok: false,
        error: `Ligne ${index + 1}: l'import n'accepte que des ventes positives.`,
      };
    }
    if (row.amount <= 0 && row.salesCount <= 0) {
      return { ok: false, error: `Ligne ${index + 1}: indiquez un montant ou un nombre.` };
    }
    const reference = row.reference?.trim().toLowerCase() || null;
    if (reference) {
      if (references.has(reference)) {
        return { ok: false, error: `Reference en double dans le fichier: ${row.reference}.` };
      }
      references.add(reference);
    }
    rows.push({ ...row, reference: row.reference?.trim() || null, label: row.label.trim() });
  }

  return { ok: true, rows };
}

export type CommissionPayrollExportRow = {
  company: string;
  employee: string;
  objective: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  salesBasis: number;
  amount: number;
  validatedAt: string;
  paidAt: string;
  entryId: string;
};

function csvCell(value: string) {
  const safe = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCommissionPayrollCsv(rows: CommissionPayrollExportRow[]) {
  const headers = [
    "Compagnie",
    "Employe",
    "Objectif",
    "Debut",
    "Fin",
    "Statut",
    "Base ventes",
    "Commission",
    "Validee le",
    "Payee le",
    "Identifiant",
  ];
  const body = rows.map((row) =>
    [
      row.company,
      row.employee,
      row.objective,
      row.periodStart,
      row.periodEnd,
      row.status,
      row.salesBasis.toFixed(2),
      row.amount.toFixed(2),
      row.validatedAt,
      row.paidAt,
      row.entryId,
    ]
      .map((cell) => csvCell(String(cell ?? "")))
      .join(COMMISSION_PAYROLL_CSV_SEPARATOR)
  );
  return `${UTF8_BOM}${[headers.map((cell) => csvCell(cell)).join(COMMISSION_PAYROLL_CSV_SEPARATOR), ...body].join("\r\n")}\r\n`;
}

export function unpaidCommissionRemainder(fullAmount: number, committedAmount: number) {
  const remainder = Math.round((fullAmount - committedAmount) * 100) / 100;
  return remainder > 0 ? remainder : 0;
}

export function isPayrollExportStatus(status: string) {
  return status === "pending_validation" || status === "paid";
}
