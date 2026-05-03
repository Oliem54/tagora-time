"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";
import type { TagoraStatTone } from "./tagora-stat-tone";
import TagoraIconBadge from "./TagoraIconBadge";

export type TagoraStatCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: string;
  icon: ReactNode;
  tone: TagoraStatTone;
  href?: string;
  badge?: ReactNode;
  loading?: boolean;
  className?: string;
  /** Taille du carré d’icône */
  iconSize?: "sm" | "md" | "lg";
};

/**
 * Carte KPI : icône à gauche, titre discret, valeur forte (réf. /direction/demandes-comptes).
 */
export default function TagoraStatCard({
  title,
  value,
  subtitle,
  icon,
  tone,
  href,
  badge,
  loading,
  className,
  iconSize = "md",
}: TagoraStatCardProps) {
  const body = (
    <>
      <TagoraIconBadge tone={tone} size={iconSize}>
        {icon}
      </TagoraIconBadge>
      <div className="tagora-stat-card-main">
        <div className="tagora-stat-card-head">
          <div className="tagora-stat-card-label">{title}</div>
          {badge ? <div className="tagora-stat-card-badge-slot">{badge}</div> : null}
        </div>
        <div
          className={cn(
            "tagora-stat-card-value",
            loading && "tagora-stat-card-value--loading"
          )}
        >
          {loading ? "—" : value}
        </div>
        {subtitle ? <div className="tagora-stat-card-sub">{subtitle}</div> : null}
      </div>
    </>
  );

  const rootClass = cn(
    "tagora-stat-card",
    href && "tagora-stat-card--interactive",
    loading && "tagora-stat-card--loading",
    className
  );

  if (href) {
    return (
      <Link href={href} className={rootClass}>
        {body}
      </Link>
    );
  }

  return <div className={rootClass}>{body}</div>;
}
