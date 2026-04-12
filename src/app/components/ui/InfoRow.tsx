import { cn } from "./cn";

type InfoRowProps = {
  label: string;
  value: string;
  className?: string;
  compact?: boolean;
};

export default function InfoRow({
  label,
  value,
  className,
  compact = false,
}: InfoRowProps) {
  return (
    <div className={cn("ui-info-row", compact && "ui-info-row-compact", className)}>
      <span className="ui-info-row-label">{label}</span>
      <span className="ui-info-row-value">{value}</span>
    </div>
  );
}
