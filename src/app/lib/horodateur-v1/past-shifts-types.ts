import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";
import type {
  HorodateurRegistreEventDetail,
  HorodateurRegistreExceptionDetail,
  RegistreCompanyParam,
  RegistreStatusFilter,
} from "./registre-types";

export type PastShiftsStatusFilter = RegistreStatusFilter;

export type HorodateurPastShiftStatusKey =
  | "complet"
  | "incomplet"
  | "en_attente"
  | "exception"
  | "corrige";

export type HorodateurPastShiftRow = {
  shiftId: string;
  employeeId: number;
  employeeName: string | null;
  primaryCompany: AccountRequestCompany | null;
  companyLabel: string;
  workDate: string;
  shiftStatus: string;
  statusKey: HorodateurPastShiftStatusKey;
  statusLabel: string;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  workedMinutes: number;
  payableMinutes: number;
  pendingExceptionMinutes: number;
  anomaliesCount: number;
  exceptionCount: number;
  pendingApprovalCount: number;
  eventCount: number;
  flags: {
    complet: boolean;
    incomplet: boolean;
    en_attente: boolean;
    corrige: boolean;
    exception: boolean;
  };
};

export type HorodateurPastShiftDetail = {
  events: HorodateurRegistreEventDetail[];
  exceptions: HorodateurRegistreExceptionDetail[];
};

export type HorodateurPastShiftsSummary = {
  periodStart: string;
  periodEnd: string;
  totalShifts: number;
  incompleteShiftCount: number;
  pendingApprovalCount: number;
  totalWorkedMinutes: number;
  totalPayableMinutes: number;
};

export type HorodateurPastShiftsPayload = {
  summary: HorodateurPastShiftsSummary;
  shifts: HorodateurPastShiftRow[];
  detailsByShiftId: Record<string, HorodateurPastShiftDetail>;
  employeeOptions: Array<{ id: number; name: string | null }>;
  companyOptions: Array<{ value: RegistreCompanyParam; label: string }>;
  phase: "read_only_v1";
};
