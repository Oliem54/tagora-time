import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";

export type DisponibiliteReason =
  | "journee_complete"
  | "tempete"
  | "manque_chauffeur"
  | "conge"
  | "inventaire"
  | "surcharge"
  | "entretien_flotte"
  | "autre";

export type ResourceUnavailabilityReason =
  | "entretien"
  | "brise"
  | "deja_occupe"
  | "inspection"
  | "reservation_interne"
  | "tempete"
  | "conge"
  | "inventaire"
  | "surcharge"
  | "autre";

const DAY_REASONS: readonly DisponibiliteReason[] = [
  "journee_complete",
  "tempete",
  "manque_chauffeur",
  "conge",
  "inventaire",
  "surcharge",
  "entretien_flotte",
  "autre",
];

const RESOURCE_REASONS: readonly ResourceUnavailabilityReason[] = [
  "entretien",
  "brise",
  "deja_occupe",
  "inspection",
  "reservation_interne",
  "tempete",
  "conge",
  "inventaire",
  "surcharge",
  "autre",
];

export function isAllowedDayReason(value: unknown): value is DisponibiliteReason {
  return typeof value === "string" && DAY_REASONS.includes(value as DisponibiliteReason);
}

export function isAllowedResourceReason(
  value: unknown
): value is ResourceUnavailabilityReason {
  return (
    typeof value === "string" &&
    RESOURCE_REASONS.includes(value as ResourceUnavailabilityReason)
  );
}

export function normalizeOptionalNote(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function requireDirectionOrAdmin(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }

  if (role !== "direction" && role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Acces reserve a la direction/admin." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, user };
}

export function parseDateOnly(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function parseIsoDateTime(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
