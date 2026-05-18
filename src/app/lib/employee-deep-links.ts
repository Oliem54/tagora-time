import "server-only";

import { resolvePublicAppBaseUrl } from "@/app/lib/horodateur-exception-quick-action.server";

/**
 * Routes employé canoniques utilisées dans les SMS / courriels actionnables.
 * Les liens construits via ces helpers pointent toujours vers le portail employé
 * et n'utilisent jamais les jetons "quick action" direction.
 */
export const EMPLOYEE_ROUTES = {
  dashboard: "/employe/dashboard",
  horodateur: "/employe/horodateur",
  horodateurExceptions: "/employe/horodateur?focus=exceptions",
  effectifs: "/employe/effectifs",
  effectifsDemandes: "/employe/effectifs/demandes",
} as const;

export type ExpectedPunchEventType =
  | "quart_debut"
  | "pause_debut"
  | "pause_fin"
  | "dinner_debut"
  | "dinner_fin"
  | "quart_fin";

const PUNCH_ACTION_LABEL_FR: Record<ExpectedPunchEventType, string> = {
  quart_debut: "ton début de quart",
  pause_debut: "ton début de pause",
  pause_fin: "ta fin de pause",
  dinner_debut: "ton début de dîner",
  dinner_fin: "ta fin de dîner",
  quart_fin: "ta fin de quart",
};

/**
 * Construit une URL absolue côté employé en se basant sur la résolution
 * partagée NEXT_PUBLIC_APP_URL / APP_PUBLIC_BASE_URL / VERCEL_URL.
 * Retourne `null` si aucune URL publique n'est résolvable.
 */
export function buildEmployeePublicUrl(path: string): string | null {
  if (!path) return null;
  const base = resolvePublicAppBaseUrl();
  if (!base) return null;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

/** Lien direct vers l'horodateur employé avec intent de punch ciblé. */
export function buildEmployeePunchUrl(
  eventType: ExpectedPunchEventType
): string | null {
  return buildEmployeePublicUrl(
    `/employe/horodateur?intent=punch&event=${encodeURIComponent(eventType)}`
  );
}

/**
 * Lien direct vers la section exceptions de l'horodateur employé.
 * Si un `exceptionId` est fourni, il est passé en query string pour permettre
 * un focus côté UI ultérieurement (sans dépendre d'un jeton serveur).
 */
export function buildEmployeeExceptionFocusUrl(
  exceptionId?: string | null
): string | null {
  if (exceptionId && exceptionId.trim().length > 0) {
    return buildEmployeePublicUrl(
      `/employe/horodateur?focus=exceptions&exceptionId=${encodeURIComponent(
        exceptionId.trim()
      )}`
    );
  }
  return buildEmployeePublicUrl(EMPLOYEE_ROUTES.horodateurExceptions);
}

/** Lien direct vers le module effectifs employé (horaire). */
export function buildEmployeeEffectifsUrl(): string | null {
  return buildEmployeePublicUrl(EMPLOYEE_ROUTES.effectifs);
}

/** Lien direct vers la liste des demandes d'horaire employé. */
export function buildEmployeeEffectifsDemandesUrl(): string | null {
  return buildEmployeePublicUrl(EMPLOYEE_ROUTES.effectifsDemandes);
}

/** Libellé court FR de l'action à compléter (utilisé dans les SMS). */
export function describeExpectedPunchAction(
  eventType: ExpectedPunchEventType
): string {
  return PUNCH_ACTION_LABEL_FR[eventType];
}
