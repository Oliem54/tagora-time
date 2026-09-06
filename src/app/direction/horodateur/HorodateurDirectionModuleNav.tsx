"use client";

import HororaAppNav from "@/app/components/horora/HororaAppNav";
import type { HororaNavId } from "@/app/components/horora/horora-nav";

export type HorodateurDirectionModuleNavActive =
  | "live"
  | "registre"
  | "quarts"
  | "paie";

type HorodateurDirectionModuleNavProps = {
  active: HorodateurDirectionModuleNavActive;
  className?: string;
  variant?: "sidebar" | "header" | "default";
  onNavigate?: () => void;
};

export default function HorodateurDirectionModuleNav({
  active,
  className,
  variant = "sidebar",
  onNavigate,
}: HorodateurDirectionModuleNavProps) {
  const mapped: HororaNavId = active;

  return (
    <HororaAppNav
      workspace="direction"
      active={mapped}
      className={className}
      variant={variant}
      onNavigate={onNavigate}
    />
  );
}
