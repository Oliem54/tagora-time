/** Viewport mobile terrain — barres d’action, fiches arrêt, bottom sheets. */
export const MOBILE_FIELD_CHROME_MEDIA = "(max-width: 768px)";

export const MOBILE_FIELD_ACTIONS_ATTR = "data-mobile-field-actions";
export const CRITICAL_FIELD_ROUTE_ATTR = "data-critical-field-route";

export function isCriticalFieldRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/direction/livraisons/jour") ||
    pathname.startsWith("/employe/livraisons/jour") ||
    pathname.startsWith("/direction/ramassages/jour") ||
    pathname.startsWith("/employe/ramassages/jour") ||
    pathname === "/employe/terrain" ||
    pathname.startsWith("/employe/terrain/") ||
    pathname === "/direction/terrain" ||
    pathname.startsWith("/direction/terrain/") ||
    pathname === "/direction/sorties-terrain" ||
    pathname.startsWith("/direction/sorties-terrain/")
  );
}
