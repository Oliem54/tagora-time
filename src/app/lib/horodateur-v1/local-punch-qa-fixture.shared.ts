/**
 * In-memory employee punch screens for local QA.
 * Active only when the local Nexus fixture is already enabled.
 * Does not read or write Supabase.
 */

import { isProcessLocalNexusFixtureEnabled } from "@/app/lib/auth/horora-local-nexus-fixture";

export const HORORA_LOCAL_PUNCH_QA_COOKIE = "horora_local_punch_qa" as const;

export const LOCAL_PUNCH_QA_STATES = [
  "hors_quart",
  "en_quart",
  "en_pause",
  "en_diner",
  "termine",
] as const;

export type LocalPunchQaState = (typeof LOCAL_PUNCH_QA_STATES)[number];

const OPEN_SHIFT_CLOCK_OFFSET_MS = 170_000;
const OPEN_SHIFT_BASE_MINUTES = 90;

export function parseLocalPunchQaState(raw: string | null | undefined): LocalPunchQaState | null {
  const value = raw?.trim();
  if (!value) return null;
  return LOCAL_PUNCH_QA_STATES.includes(value as LocalPunchQaState)
    ? (value as LocalPunchQaState)
    : null;
}

export function resolveLocalPunchQaState(input: {
  fixtureEnabled: boolean;
  cookie: string | null | undefined;
}): LocalPunchQaState | null {
  if (!input.fixtureEnabled) return null;
  return parseLocalPunchQaState(input.cookie);
}

export function localPunchQaStateFromRequest(input: {
  hostname: string | null | undefined;
  cookie: string | null | undefined;
}): LocalPunchQaState | null {
  return resolveLocalPunchQaState({
    fixtureEnabled: isProcessLocalNexusFixtureEnabled(input.hostname),
    cookie: input.cookie,
  });
}

export function buildLocalPunchQaPayload(state: LocalPunchQaState, nowMs: number) {
  const nowIso = new Date(nowMs).toISOString();
  const open = state === "en_quart" || state === "en_pause" || state === "en_diner";
  const shiftStart = "2026-10-05T12:00:00.000Z";
  const computedAt =
    state === "en_quart" ? new Date(nowMs - OPEN_SHIFT_CLOCK_OFFSET_MS).toISOString() : nowIso;
  const employee = {
    employeeId: 900001,
    fullName: "Fixture Locale",
    email: null,
    primaryCompany: "oliem_solutions" as const,
    pausePaid: false,
    lunchPaid: false,
    active: true,
  };
  const currentState = {
    current_state: state,
    status: state,
    last_event_id: `local-qa-${state}`,
    last_event_at: open ? shiftStart : state === "termine" ? "2026-10-05T21:00:00.000Z" : null,
    last_event_type: open ? "quart_debut" : state === "termine" ? "quart_fin" : null,
    startedAt: open ? shiftStart : null,
    has_open_exception: false,
    activeExceptionCount: 0,
  };
  const todayShift = {
    work_date: "2026-10-05",
    worked_minutes: open ? OPEN_SHIFT_BASE_MINUTES : state === "termine" ? 480 : 0,
    payable_minutes: open ? OPEN_SHIFT_BASE_MINUTES : state === "termine" ? 480 : 0,
    paid_break_minutes: 0,
    unpaid_break_minutes: 0,
    unpaid_lunch_minutes: 0,
    pending_exception_minutes: 0,
    approved_exception_minutes: 0,
    anomalies_count: 0,
    status: state === "termine" ? "ferme" : "ouvert",
    shift_start_at: open ? shiftStart : null,
  };
  const todayTimeDisplay = {
    officialPayableMinutes: state === "termine" ? 480 : open ? OPEN_SHIFT_BASE_MINUTES : 0,
    livePayableMinutes: open ? OPEN_SHIFT_BASE_MINUTES : state === "termine" ? 480 : 0,
    liveWorkedMinutes: open ? OPEN_SHIFT_BASE_MINUTES : 0,
    hasOpenShiftAccrual: state === "en_quart",
    hasPendingOperationalPunchToday: false,
    pendingPunchBlocksAccrual: false,
    openShiftWorkDateMismatch: false,
    openShiftWorkDate: null,
    openShiftSafetyCapReached: false,
    openShiftSafetyCapAt: null,
    openShiftElapsedMinutes: open ? OPEN_SHIFT_BASE_MINUTES : 0,
    computedAt,
  };
  const weeklyProjection = {
    workedMinutes: state === "termine" ? 480 : open ? OPEN_SHIFT_BASE_MINUTES : 0,
    targetMinutes: 2400,
    remainingMinutes: 2400,
    projectedOverflowMinutes: 0,
  };
  const latenessContext = {
    workDate: "2026-10-05",
    isLate: false,
    lateMinutes: 0,
    scheduledStartAt: shiftStart,
    scheduledStartLabel: "08:00",
    currentAt: nowIso,
    currentLabel: "08:00",
    isWithinScheduleWindow: true,
    canPunchNow: state === "hors_quart",
    canRequestRetroactiveCorrection: true,
    showLateStartCard: false,
  };
  const body = {
    success: true,
    localPunchQa: true,
    employee,
    currentState,
    todayShift,
    shift: todayShift,
    todayTimeDisplay,
    weeklyProjection,
    pendingExceptions: [],
    pendingPunchOut: null,
    latenessContext,
    longLeave: null,
  };
  return {
    me: body,
    punch: body,
    history: {
      success: true,
      localPunchQa: true,
      employee,
      workDate: "2026-10-05",
      shift: todayShift,
      events: [],
      exceptions: [],
    },
  };
}
