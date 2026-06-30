"use client";

import type { ReactNode } from "react";
import AppCard from "@/app/components/ui/AppCard";
import { cn } from "@/app/components/ui/cn";

type AdminCommissionsMetricCardProps = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  valueIsCurrency?: boolean;
  className?: string;
};

export default function AdminCommissionsMetricCard({
  label,
  value,
  note,
  icon,
  valueIsCurrency = false,
  className,
}: AdminCommissionsMetricCardProps) {
  const hasIcon = Boolean(icon);

  return (
    <AppCard
      tone="muted"
      className={cn(
        "admin-metric-card",
        hasIcon && "admin-metric-card--icon",
        className
      )}
    >
      {icon ? <div className="admin-metric-card__icon">{icon}</div> : null}
      <div className="admin-metric-card__content">
        <span className="admin-metric-card__label">{label}</span>
        <span
          className={cn(
            "admin-metric-card__value",
            valueIsCurrency && "admin-metric-card__value--currency"
          )}
        >
          {value}
        </span>
        {note ? <span className="admin-metric-card__note">{note}</span> : null}
      </div>
    </AppCard>
  );
}
