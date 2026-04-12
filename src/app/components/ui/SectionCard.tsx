import type { HTMLAttributes, ReactNode } from "react";
import AppCard from "./AppCard";
import { cn } from "./cn";

type SectionCardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: "default" | "muted" | "elevated";
};

export default function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  tone = "default",
  ...props
}: SectionCardProps) {
  return (
    <AppCard className={cn("ui-section-card", className)} tone={tone} {...props}>
      {title || subtitle || actions ? (
        <div className="ui-section-card-head">
          <div className="ui-section-card-copy">
            {title ? <h2 className="ui-section-card-title">{title}</h2> : null}
            {subtitle ? <p className="ui-section-card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-section-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className="ui-section-card-body">{children}</div>
      ) : null}
    </AppCard>
  );
}
