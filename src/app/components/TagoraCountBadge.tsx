"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";

type TagoraCountBadgeProps = {
  children: ReactNode;
  "aria-label"?: string;
  className?: string;
};

/**
 * Pastille rouge de notification (compteurs en attente, etc.).
 */
export default function TagoraCountBadge({
  children,
  "aria-label": ariaLabel,
  className,
}: TagoraCountBadgeProps) {
  return (
    <span
      aria-label={ariaLabel}
      className={cn("tagora-count-badge", className)}
    >
      {children}
    </span>
  );
}
