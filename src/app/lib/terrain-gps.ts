import type { AccountRequestCompany } from "@/app/lib/account-requests.shared";

export type TerrainGpsStatus =
  | "actif"
  | "deplacement"
  | "arret"
  | "arrive"
  | "inactif";

export type TerrainPositionLike = {
  recorded_at?: string | null;
  gps_status?: string | null;
  speed_kmh?: number | null;
  arrived_at?: string | null;
};

export function terrainNow() {
  return new Date();
}

export function toFiniteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatTerrainDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDurationMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "0 min";
  }

  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

export function minutesBetween(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return 0;

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }

  return Math.round((endMs - startMs) / 60000);
}

export function isoDateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function isSameIsoDay(value: string | null | undefined, day: string) {
  return isoDateOnly(value) === day;
}

export function normalizeTerrainGpsStatus(position: TerrainPositionLike): TerrainGpsStatus {
  const rawStatus = String(position.gps_status ?? "")
    .trim()
    .toLowerCase();
  const speed = toFiniteNumber(position.speed_kmh);
  const nowIso = terrainNow().toISOString();
  const staleMinutes = minutesBetween(position.recorded_at, nowIso);

  if (rawStatus === "arrive" || rawStatus === "arrivee" || rawStatus === "arrived") {
    return "arrive";
  }

  if (
    rawStatus === "deplacement" ||
    rawStatus === "moving" ||
    rawStatus === "en_route" ||
    rawStatus === "livraison"
  ) {
    return "deplacement";
  }

  if (rawStatus === "arret" || rawStatus === "stopped" || rawStatus === "pause") {
    return staleMinutes > 90 ? "inactif" : "arret";
  }

  if (speed >= 5) {
    return "deplacement";
  }

  if (position.arrived_at) {
    return "arrive";
  }

  if (staleMinutes > 90) {
    return "inactif";
  }

  if (speed > 0) {
    return "actif";
  }

  return "arret";
}

export function getTerrainStatusLabel(status: TerrainGpsStatus) {
  if (status === "deplacement") return "En deplacement";
  if (status === "arret") return "A l arret";
  if (status === "arrive") return "Arrive a destination";
  if (status === "inactif") return "Inactif";
  return "Actif";
}

export function getTerrainStatusStyle(status: TerrainGpsStatus) {
  if (status === "arrive") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "1px solid #86efac",
    };
  }

  if (status === "deplacement") {
    return {
      color: "#1d4ed8",
      background: "#dbeafe",
      border: "1px solid #93c5fd",
    };
  }

  if (status === "actif") {
    return {
      color: "#0f766e",
      background: "#ccfbf1",
      border: "1px solid #5eead4",
    };
  }

  if (status === "arret") {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid #fcd34d",
    };
  }

  return {
    color: "#991b1b",
    background: "#fee2e2",
    border: "1px solid #fca5a5",
  };
}

export function getProfitTone(value: number, marginPercent: number) {
  if (value < 0 || marginPercent < 0) {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "1px solid #fca5a5",
    };
  }

  if (marginPercent < 10) {
    return {
      color: "#92400e",
      background: "#fef3c7",
      border: "1px solid #fcd34d",
    };
  }

  return {
    color: "#166534",
    background: "#dcfce7",
    border: "1px solid #86efac",
  };
}

export function normalizeCompanyValue(
  value: unknown
): AccountRequestCompany | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "oliem_solutions") {
    return "oliem_solutions";
  }

  if (normalized === "titan_produits_industriels") {
    return "titan_produits_industriels";
  }

  return null;
}
