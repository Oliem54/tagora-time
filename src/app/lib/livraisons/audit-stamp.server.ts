import "server-only";

import type { User } from "@supabase/supabase-js";

/**
 * Renvoie un nom d'affichage stable pour stamper la livraison.
 * Ordre de preference :
 *   1. user_metadata.full_name
 *   2. app_metadata.full_name
 *   3. nom_complet (champ historique)
 *   4. first_name + last_name
 *   5. email
 *   6. user.id (fallback ultime)
 */
export function getUserDisplayName(user: User): string {
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const candidates = [
    userMeta.full_name,
    appMeta.full_name,
    userMeta.nom_complet,
    appMeta.nom_complet,
    userMeta.name,
    appMeta.name,
  ];

  for (const value of candidates) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  const firstName = typeof userMeta.first_name === "string" ? userMeta.first_name.trim() : "";
  const lastName = typeof userMeta.last_name === "string" ? userMeta.last_name.trim() : "";
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (composed) return composed;

  if (user.email && user.email.trim()) return user.email.trim();
  return user.id;
}

export type LivraisonUpdateStamp = {
  updated_by_user_id: string;
  updated_by_name: string;
  updated_at: string;
};

export type LivraisonCreateStamp = LivraisonUpdateStamp & {
  created_by_user_id: string;
  created_by_name: string;
  scheduled_by_user_id: string;
  scheduled_by_name: string;
  created_at: string;
};

/**
 * Champs a fusionner dans un payload d'UPDATE pour tracer l'auteur de la modification.
 */
export function buildUpdateStamp(user: User): LivraisonUpdateStamp {
  return {
    updated_by_user_id: user.id,
    updated_by_name: getUserDisplayName(user),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Champs a fusionner dans un payload d'INSERT pour tracer l'auteur de la creation.
 * scheduled_by_* est rempli par defaut avec le createur (l'utilisateur qui programme).
 */
export function buildCreateStamp(user: User): LivraisonCreateStamp {
  const now = new Date().toISOString();
  const name = getUserDisplayName(user);
  return {
    created_by_user_id: user.id,
    created_by_name: name,
    scheduled_by_user_id: user.id,
    scheduled_by_name: name,
    updated_by_user_id: user.id,
    updated_by_name: name,
    created_at: now,
    updated_at: now,
  };
}
