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
      <div className="admin-metric-card__layout">
        {icon ? <div className="admin-metric-card__icon">{icon}</div> : null}
        <div className="admin-metric-card__stack">
          <div className="admin-metric-card__label">{label}</div>
          <div
            className={cn(
              "admin-metric-card__value",
              valueIsCurrency && "admin-metric-card__value--currency"
            )}
          >
            {value}
          </div>
          {note ? <div className="admin-metric-card__note">{note}</div> : null}
        </div>
      </div>
    </AppCard>
  );
}
