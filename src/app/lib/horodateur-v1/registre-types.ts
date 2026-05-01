import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type RegistreStatusFilter =
  | "all"
  | "complet"
  | "incomplet"
  | "en_attente"
  | "corrige"
  | "exception";

export type RegistreCompanyParam =
  | "all"
  | "oliem_solutions"
  | "titan_produits_industriels";

export type HorodateurRegistreSummary = {
  totalWorkedMinutes: number;
  totalApprovedPayableMinutes: number;
  totalPendingPayableMinutes: number;
  totalExceptionImpactMinutes: number;
  titanRefundablePayableMinutes: number;
  activeEmployeesInPeriod: number;
  incompleteShiftCount: number;
  periodStart: string;
  periodEnd: string;
};

export type HorodateurRegistreEmployeeRow = {
  employeeId: number;
  employeeName: string | null;
  primaryCompany: AccountRequestCompany | null;
  primaryCompanyLabel: string;
  periodLabel: string;
  normalMinutes: number;
  overtimeMinutes: number;
  titanRefundableMinutes: number;
  breakMinutes: number;
  exceptionCount: number;
  pendingExceptionMinutes: number;
  statusKey: "complet" | "incomplet" | "en_attente" | "exception" | "corrige";
  statusLabel: string;
  flags: {
    complet: boolean;
    incomplet: boolean;
    en_attente: boolean;
    corrige: boolean;
    exception: boolean;
  };
  lastUpdatedAt: string | null;
};

export type HorodateurRegistreDailyRow = {
  workDate: string;
  workedMinutes: number;
  payableMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  unpaidLunchMinutes: number;
  companyContext: AccountRequestCompany | null;
  shiftStatus: string;
  hasIncompletePunch: boolean;
};

export type HorodateurRegistreEventDetail = {
  id: string;
  workDate: string | null;
  eventType: string;
  canonicalType: string | null;
  occurredAt: string | null;
  status: string;
  sourceKind: string | null;
  actorRole: string | null;
  companyContext: string | null;
  livraisonId: number | null;
  dossierId: number | null;
  sortieId: number | null;
  notes: string | null;
  isManualCorrection: boolean;
  exceptionCode: string | null;
  approvalNote: string | null;
  approvedAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type HorodateurRegistreExceptionDetail = {
  id: string;
  exceptionType: string;
  reasonLabel: string;
  details: string | null;
  impactMinutes: number;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  approvedMinutes: number | null;
  sourceEventId: string;
};

export type HorodateurRegistrePendingApproval = {
  kind: "event" | "exception";
  id: string;
  employeeId: number;
  employeeName: string | null;
  label: string;
  occurredOrRequestedAt: string | null;
};

export type HorodateurRegistrePayload = {
  summary: HorodateurRegistreSummary;
  employees: HorodateurRegistreEmployeeRow[];
  dailyDetails: Record<string, HorodateurRegistreDailyRow[]>;
  exceptions: HorodateurRegistreExceptionDetail[];
  pendingApprovals: HorodateurRegistrePendingApproval[];
  employeeOptions: Array<{ id: number; name: string | null }>;
  companyOptions: Array<{ value: RegistreCompanyParam; label: string }>;
  exportPlanned: {
    pdf: boolean;
    excel: boolean;
    payroll: boolean;
    byCompany: boolean;
    titanRefundable: boolean;
  };
};
