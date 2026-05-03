import type { EffectifsScheduleRequest } from "@/app/lib/effectifs-schedule-request.shared";
import type { EffectifsEmployee } from "@/app/lib/effectifs-payload.shared";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type MonHoraireCoworker = {
  employeeId: number;
  name: string | null;
  startLocal: string;
  endLocal: string;
  departmentLabel: string;
};

export type MonHoraireDay = {
  date: string;
  weekdayLabel: string;
  statusKey:
    | "work"
    | "off"
    | "vacation_approved"
    | "leave_approved"
    | "pending"
    | "modified"
    | "long_leave";
  statusLabel: string;
  startLocal: string | null;
  endLocal: string | null;
  departmentLabel: string;
  locationLabel: string;
  companyLabel: string;
  note: string | null;
  coworkers: MonHoraireCoworker[];
};

export type MonHorairePayload = {
  employeeId: number;
  employeeName: string | null;
  primaryCompany: AccountRequestCompany | null;
  companyLabel: string;
  weeklySchedule: EffectifsEmployee | null;
  weekGrid: MonHoraireDay[];
  today: MonHoraireDay | null;
  tomorrow: MonHoraireDay | null;
  nextShift: { date: string; weekdayLabel: string; startLocal: string; endLocal: string } | null;
  pendingRequests: EffectifsScheduleRequest[];
  approvedRequests: EffectifsScheduleRequest[];
  rejectedRequests: EffectifsScheduleRequest[];
  nextVacation: EffectifsScheduleRequest | null;
  nextDayOff: EffectifsScheduleRequest | null;
  pendingCount: number;
  /** Congé prolongé actif — message en tête de page, sans détail médical. */
  longLeave:
    | null
    | {
        publicLabel: string;
        startDate: string;
        /** « indéterminé » ou date ISO */
        returnSummary: string;
      };
};
