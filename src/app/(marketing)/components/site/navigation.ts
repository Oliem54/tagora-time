import {
  LOGIN_STANDARD_PATH,
  NEXUS_PUBLIC_ORIGIN,
} from "@/app/lib/canonical-domains";

export const marketingNavigation = [
  { label: "Accueil", href: "/" },
  { label: "Logiciel", href: "/logiciel" },
  { label: "Etiquettes", href: "/etiquettes" },
  { label: "Contact", href: "/contact" },
] as const;

/**
 * Liens marketing Time — chemins relatifs (DEC-015).
 * `nexus` est le seul lien absolu volontaire vers app.tagora.ca (réservé Nexus).
 */
export const marketingConnectionLinks = {
  root: LOGIN_STANDARD_PATH,
  app: LOGIN_STANDARD_PATH,
  employe: "/employe",
  direction: "/direction",
  /** Lien Nexus légitime — ne pas utiliser comme domaine TAGORA Time. */
  nexus: NEXUS_PUBLIC_ORIGIN,
  demoMailto: "mailto:contact@tagora.ca?subject=Demande%20de%20demo%20TAGORA",
  contactMailto: "mailto:contact@tagora.ca",
} as const;
