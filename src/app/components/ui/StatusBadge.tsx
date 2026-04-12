import { cn } from "./cn";

type StatusBadgeProps = {
  label: string;
  tone?: "default" | "info" | "success" | "warning" | "danger";
  className?: string;
};

export default function StatusBadge({
  label,
  tone = "default",
  className,
}: StatusBadgeProps) {
  return (
    <span className={cn("ui-status-badge", `ui-status-badge-${tone}`, className)}>
      {label}
    </span>
  );
}
