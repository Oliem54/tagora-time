import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedRequestUser,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const EFFECTIFS_DEPARTMENTS = [
  "Montage voiturette",
  "Showroom Oliem",
  "Showroom Titan",
  "Opérations",
  "Service après vente",
  "Livreur",
  "Design numérique",
  "Administration",
  "Autre",
] as const;

export type EffectifsDepartment = (typeof EFFECTIFS_DEPARTMENTS)[number];
export const EFFECTIFS_LOCATIONS = [
  "Oliem",
  "Titan",
  "Entrepôt",
  "Route",
  "Télétravail",
  "Autre",
] as const;
export type EffectifsLocation = (typeof EFFECTIFS_LOCATIONS)[number];

export type EffectifsStatus = "covered" | "watch" | "missing" | "surplus" | "not_required";

export function normalizeDepartment(value: unknown): EffectifsDepartment | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "montage" || normalized === "montage voiturette") return "Montage voiturette";
  if (normalized === "showroom" || normalized === "showroom oliem") return "Showroom Oliem";
  if (normalized === "showroom titan") return "Showroom Titan";
  if (normalized === "operations" || normalized === "opérations") return "Opérations";
  if (
    normalized === "sav" ||
    normalized === "service apres vente" ||
    normalized === "service après vente"
  ) {
    return "Service après vente";
  }
  if (normalized === "livreur" || normalized === "livraison") return "Livreur";
  if (
    normalized === "design numerique" ||
    normalized === "design numérique" ||
    normalized === "design"
  ) {
    return "Design numérique";
  }
  if (normalized === "administration") return "Administration";
  if (normalized === "autre") return "Autre";
  return null;
}

export function normalizeLocation(value: unknown): EffectifsLocation | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "oliem") return "Oliem";
  if (normalized === "titan") return "Titan";
  if (normalized === "entrepot" || normalized === "entrepôt" || normalized === "entrepôt ") {
    return "Entrepôt";
  }
  if (normalized === "route") return "Route";
  if (normalized === "teletravail" || normalized === "télétravail") return "Télétravail";
  if (normalized === "autre") return "Autre";
  return null;
}

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfIsoWeek(input: Date) {
  const date = new Date(input);
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + shift);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfIsoWeek(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function computeHoursFromRange(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end <= start) return 0;
  return Math.round(((end - start) / 60) * 100) / 100;
}

export async function requireDirectionOrAdmin(req: NextRequest) {
  const { user, role } = await getStrictDirectionRequestUser(req);
  if (!user || (role !== "direction" && role !== "admin")) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces reserve a la direction/admin." }, { status: 403 }),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export async function requireAuthenticatedViewer(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export function isMissingRelationInSchemaCache(
  error: { message?: string; code?: string } | null,
  relationName: string
) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  const relation = relationName.toLowerCase();
  return (
    error.code === "PGRST205" ||
    (message.includes("schema cache") && message.includes(relation)) ||
    (message.includes("relation") && message.includes(relation) && message.includes("does not exist"))
  );
}
