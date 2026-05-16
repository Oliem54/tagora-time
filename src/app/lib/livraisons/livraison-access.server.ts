import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getChauffeurIdForAuthUser } from "@/app/lib/app-alerts-dual-write.server";

export type LivraisonChauffeurRow = {
  chauffeur_id?: number | string | null;
};

export function isLivraisonManagementRole(role: string | null | undefined) {
  return role === "direction" || role === "admin";
}

export function parseAssignedChauffeurId(
  livraison: LivraisonChauffeurRow
): number | null {
  const raw = livraison.chauffeur_id;
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export async function assertEmployeAssignedToLivraison(
  supabase: SupabaseClient,
  authUserId: string,
  livraison: LivraisonChauffeurRow
): Promise<{ ok: true; chauffeurId: number } | { ok: false; message: string }> {
  const chauffeurId = await getChauffeurIdForAuthUser(supabase, authUserId);
  if (chauffeurId == null) {
    return {
      ok: false,
      message: "Profil livreur introuvable pour ce compte employe.",
    };
  }

  const assignedId = parseAssignedChauffeurId(livraison);
  if (assignedId == null) {
    return {
      ok: false,
      message: "Aucun livreur assigne a cette livraison.",
    };
  }

  if (assignedId !== chauffeurId) {
    return {
      ok: false,
      message: "Cette livraison est assignee a un autre livreur.",
    };
  }

  return { ok: true, chauffeurId };
}

export async function assertCanTriggerEnRoute(input: {
  supabase: SupabaseClient;
  authUserId: string;
  role: string | null | undefined;
  livraison: LivraisonChauffeurRow;
}): Promise<{ allowed: true } | { allowed: false; message: string; status: number }> {
  if (isLivraisonManagementRole(input.role)) {
    return { allowed: true };
  }

  if (input.role !== "employe") {
    return {
      allowed: false,
      message: "Acces refuse.",
      status: 403,
    };
  }

  const assignment = await assertEmployeAssignedToLivraison(
    input.supabase,
    input.authUserId,
    input.livraison
  );

  if (!assignment.ok) {
    return {
      allowed: false,
      message: assignment.message,
      status: 403,
    };
  }

  return { allowed: true };
}
