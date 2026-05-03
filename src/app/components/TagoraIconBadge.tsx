"use client";

import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";
import type { TagoraStatTone } from "./tagora-stat-tone";

export type TagoraIconBadgeSize = "sm" | "md" | "lg";

type TagoraIconBadgeProps = {
  children: ReactNode;
  tone: TagoraStatTone;
  size?: TagoraIconBadgeSize;
  className?: string;
  "aria-hidden"?: boolean;
};

const sizeClass: Record<TagoraIconBadgeSize, string> = {
  sm: "tagora-icon-badge--sm",
  md: "tagora-icon-badge--md",
  lg: "tagora-icon-badge--lg",
};

/**
 * Icône dans un carré arrondi, fond pastel, bordure légère (réf. demandes-comptes).
 */
export default function TagoraIconBadge({
  children,
  tone,
  size = "md",
  className,
  "aria-hidden": ariaHidden,
}: TagoraIconBadgeProps) {
  return (
    <div
      className={cn(
        "tagora-icon-badge",
        sizeClass[size],
        `tagora-icon-badge--${tone}`,
        className
      )}
      aria-hidden={ariaHidden}
    >
      {children}
    </div>
  );
}
