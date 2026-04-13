import {
  calculateGpsDistanceMeters,
  getGpsBaseEventLabel,
  type GpsBaseEventName,
  type LatestGpsBaseStatus,
} from "@/app/lib/gps-base-detection";
import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export const GPS_BASE_EVENT_TYPES = [
  "gps_base_entered",
  "gps_base_exited",
  "gps_base_arrived",
  "gps_base_returned",
] as const;

export const GPS_BASE_EVENT_ANTI_DUP_MINUTES = 5;

export type PersistableGpsBaseEvent = {
  user_id: string | null;
  chauffeur_id: string | number | null;
  company_context: AccountRequestCompany | null;
  gps_position_id: string;
  base_id: string;
  event_type: GpsBaseEventName;
  event_label: string;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  rayon_metres: number | null;
  metadata: Record<string, unknown>;
  occurred_at: string | null;
};

export type ExistingGpsBaseEventLike = {
  id?: string | null;
  event_type?: string | null;
  base_id?: string | null;
  occurred_at?: string | null;
};

export function isGpsBaseEventType(value: unknown): value is GpsBaseEventName {
  return GPS_BASE_EVENT_TYPES.includes(value as GpsBaseEventName);
}

function minutesBetweenIso(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return Number.POSITIVE_INFINITY;

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(endMs - startMs) / 60000;
}

export function buildPersistableGpsBaseEvents(options: {
  gpsPositionId: string;
  userId: string | null;
  chauffeurId: string | number | null;
  companyContext: AccountRequestCompany | null;
  latitude: number | null;
  longitude: number | null;
  status: LatestGpsBaseStatus;
}) {
  const latestEntry = options.status.timeline[options.status.timeline.length - 1] ?? null;

  if (!latestEntry) {
    return [] as PersistableGpsBaseEvent[];
  }

  return latestEntry.events.map((event) => {
    const baseMatch =
      event.name === "gps_base_exited"
        ? latestEntry.previous_base
        : latestEntry.current_base;
    const distance =
      baseMatch && options.latitude != null && options.longitude != null
        ? Math.round(
            calculateGpsDistanceMeters({
              originLatitude: baseMatch.base.latitude,
              originLongitude: baseMatch.base.longitude,
              latitude: options.latitude,
              longitude: options.longitude,
            })
          )
        : baseMatch?.distance_m ?? null;

    return {
      user_id: options.userId,
      chauffeur_id: options.chauffeurId,
      company_context: options.companyContext,
      gps_position_id: options.gpsPositionId,
      base_id: event.base_id,
      event_type: event.name,
      event_label: event.label || getGpsBaseEventLabel(event.name),
      latitude: options.latitude,
      longitude: options.longitude,
      distance_m: distance,
      rayon_metres: baseMatch?.radius_m ?? null,
      metadata: {
        detection_source: "gps_bases",
        detection_version: 1,
        anti_duplicate_window_minutes: GPS_BASE_EVENT_ANTI_DUP_MINUTES,
        base_name: event.base_name,
      },
      occurred_at: event.occurred_at,
    } satisfies PersistableGpsBaseEvent;
  });
}

export function shouldPersistGpsBaseEvent(
  candidate: PersistableGpsBaseEvent,
  lastEvent: ExistingGpsBaseEventLike | null
) {
  if (!lastEvent?.event_type || !lastEvent.base_id) {
    return true;
  }

  if (lastEvent.event_type !== candidate.event_type || lastEvent.base_id !== candidate.base_id) {
    return true;
  }

  return (
    minutesBetweenIso(lastEvent.occurred_at, candidate.occurred_at) >
    GPS_BASE_EVENT_ANTI_DUP_MINUTES
  );
}
