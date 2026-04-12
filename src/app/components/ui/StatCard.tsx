import type { ReactNode } from "react";
import AppCard from "./AppCard";
import { cn } from "./cn";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "info" | "success" | "warning" | "danger";
  className?: string;
};

export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <AppCard className={cn("ui-stat-card", `ui-stat-card-${tone}`, className)}>
      <div className="ui-stat-card-head">
        <span className="ui-stat-card-label">{label}</span>
        {icon ? <span className="ui-stat-card-icon">{icon}</span> : null}
      </div>
      <div className="ui-stat-card-value">{value}</div>
      {hint ? <div className="ui-stat-card-hint">{hint}</div> : null}
    </AppCard>
  );
}
