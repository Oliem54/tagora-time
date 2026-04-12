export type BreakEntry = {
  label: string;
  minutes: number;
  paid: boolean;
};

export type WorkTimeSummary = {
  presenceMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  payableMinutes: number;
  nonPayableMinutes: number;
  facturableMinutes: number;
  presenceHours: number;
  payableHours: number;
  facturableHours: number;
  presenceText: string;
  paidBreakText: string;
  unpaidBreakText: string;
  payableText: string;
  nonPayableText: string;
  facturableText: string;
};

function parseMomentToMinutes(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const timeMatch = normalized.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (timeMatch) {
    return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  }

  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp / 60000;
}

function toRoundedHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

export function normalizeBreakMinutes(value: unknown) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.round(parsed);
}

export function formatDurationMinutes(totalMinutes: number) {
  const normalized = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function buildBreakEntries(options: {
  morningMinutes: unknown;
  morningPaid: boolean;
  lunchMinutes: unknown;
  lunchPaid: boolean;
  afternoonMinutes: unknown;
  afternoonPaid: boolean;
}) {
  const entries: BreakEntry[] = [
    {
      label: "Pause matin",
      minutes: normalizeBreakMinutes(options.morningMinutes),
      paid: options.morningPaid,
    },
    {
      label: "Diner",
      minutes: normalizeBreakMinutes(options.lunchMinutes),
      paid: options.lunchPaid,
    },
    {
      label: "Pause apres-midi",
      minutes: normalizeBreakMinutes(options.afternoonMinutes),
      paid: options.afternoonPaid,
    },
  ];

  return entries.filter((item) => item.minutes > 0);
}

export function computeWorkTimeSummary(options: {
  start: string | null | undefined;
  end: string | null | undefined;
  breaks: BreakEntry[];
  billable?: boolean;
}) {
  const startMinutes = parseMomentToMinutes(options.start);
  const endMinutes = parseMomentToMinutes(options.end);
  const presenceMinutes =
    startMinutes != null && endMinutes != null
      ? Math.max(0, Math.round(endMinutes - startMinutes))
      : 0;
  const paidBreakMinutes = options.breaks.reduce(
    (sum, item) => sum + (item.paid ? item.minutes : 0),
    0
  );
  const unpaidBreakMinutes = options.breaks.reduce(
    (sum, item) => sum + (!item.paid ? item.minutes : 0),
    0
  );
  const payableMinutes = Math.max(0, presenceMinutes - unpaidBreakMinutes);
  const facturableMinutes = options.billable === false ? 0 : payableMinutes;

  return {
    presenceMinutes,
    paidBreakMinutes,
    unpaidBreakMinutes,
    payableMinutes,
    nonPayableMinutes: unpaidBreakMinutes,
    facturableMinutes,
    presenceHours: toRoundedHours(presenceMinutes),
    payableHours: toRoundedHours(payableMinutes),
    facturableHours: toRoundedHours(facturableMinutes),
    presenceText: formatDurationMinutes(presenceMinutes),
    paidBreakText: formatDurationMinutes(paidBreakMinutes),
    unpaidBreakText: formatDurationMinutes(unpaidBreakMinutes),
    payableText: formatDurationMinutes(payableMinutes),
    nonPayableText: formatDurationMinutes(unpaidBreakMinutes),
    facturableText: formatDurationMinutes(facturableMinutes),
  };
}
