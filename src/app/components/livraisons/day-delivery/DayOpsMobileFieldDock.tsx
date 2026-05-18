"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  mode: "livraison" | "ramassage";
  children: ReactNode;
};

/**
 * Conteneur fixe pour la barre d’actions terrain — portail vers body pour éviter
 * tout masquage par overflow/transform des ancêtres.
 */
export default function DayOpsMobileFieldDock({ mode, children }: Props) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const dock = (
    <div
      className={`day-ops-mobile-field-dock day-ops-mobile-field-dock--${mode}`}
      data-day-ops-mobile-dock={mode}
      role="region"
      aria-label={
        mode === "livraison" ? "Actions terrain livraison" : "Actions terrain ramassage"
      }
    >
      {children}
    </div>
  );

  if (!portalTarget) return dock;

  return createPortal(dock, portalTarget);
}
