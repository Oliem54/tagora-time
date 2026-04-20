import { NextResponse } from "next/server";
import {
  HORODATEUR_CANONICAL_EVENT_TYPES,
  HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE,
  type HorodateurCanonicalEventType,
  type HorodateurPhase1CreatePunchResult,
  type HorodateurPhase1EventRecord,
} from "@/app/lib/horodateur-v1/types";

export type LegacyZoneEventInput = "zone_entry" | "zone_exit";

const LEGACY_ZONE_TO_CANONICAL_EVENT: Record<
  LegacyZoneEventInput,
  HorodateurCanonicalEventType
> = {
  zone_entry: "terrain_end",
  zone_exit: "terrain_start",
};

function isCanonicalEventType(value: string): value is HorodateurCanonicalEventType {
  return HORODATEUR_CANONICAL_EVENT_TYPES.includes(
    value as HorodateurCanonicalEventType
  );
}

export function toCanonicalEventFromLegacyZone(value: unknown) {
  if (value === "zone_entry" || value === "zone_exit") {
    return LEGACY_ZONE_TO_CANONICAL_EVENT[value];
  }
  return null;
}

export function toLegacyZoneEvent(value: unknown) {
  if (value === "terrain_start") {
    return "zone_exit";
  }
  if (value === "terrain_end") {
    return "zone_entry";
  }
  return null;
}

export function toLegacyEventType(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  if (isCanonicalEventType(value)) {
    return HORODATEUR_CANONICAL_TO_LEGACY_EVENT_TYPE[value];
  }
  return value;
}

export function eventOccurredAt(event: {
  occurred_at?: string | null;
  event_time?: string | null;
  created_at?: string | null;
}) {
  return event.occurred_at ?? event.event_time ?? event.created_at ?? null;
}

export function normalizeLegacyNote(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseOptionalOccurredAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const occurredAt = value.trim();
  return Number.isFinite(Date.parse(occurredAt)) ? occurredAt : null;
}

export function mapPunchResultToLegacyEvent(
  result: HorodateurPhase1CreatePunchResult,
  options?: {
    metadata?: Record<string, unknown> | null;
    companyContext?: string | null;
  }
) {
  return {
    id: result.event.id,
    event_type: toLegacyEventType(result.event.event_type),
    occurred_at: eventOccurredAt(result.event),
    company_context: options?.companyContext ?? null,
    status: result.event.status,
    notes: result.event.notes ?? result.event.note ?? null,
    note: result.event.note ?? result.event.notes ?? null,
    metadata: options?.metadata ?? null,
  };
}

export function mapLegacyAuthorizationFromException(
  event: HorodateurPhase1EventRecord,
  exception: HorodateurPhase1CreatePunchResult["exception"]
) {
  if (!exception) {
    return null;
  }

  return {
    id: exception.id,
    status: exception.status,
    request_type:
      exception.exception_type === "outside_schedule"
        ? "early_start"
        : "legacy_horodateur_exception",
    justification: exception.details ?? exception.reason_label ?? "Validation requise.",
    requested_value: {
      event_id: event.id,
      event_type: toLegacyEventType(event.event_type),
      occurred_at: eventOccurredAt(event),
    },
    requested_at: eventOccurredAt(event),
  };
}

export function legacyErrorResponse(
  error: unknown,
  fallbackMessage: string,
  status = 500
) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status }
  );
}

