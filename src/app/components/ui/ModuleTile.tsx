import type { ReactNode } from "react";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";
import AppCard from "./AppCard";
import { cn } from "./cn";

type ModuleTileProps = {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  /** Palette TAGORA (prioritaire sur `accent`) */
  tone?: TagoraStatTone;
  accent?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  action: ReactNode;
  className?: string;
};

export default function ModuleTile({
  eyebrow = "Module",
  title,
  description,
  icon,
  tone,
  accent,
  badge,
  footer,
  action,
  className,
}: ModuleTileProps) {
  return (
    <AppCard className={cn("ui-module-tile tagora-dashboard-module-card", className)}>
      <div className="ui-module-tile-body">
        <div className="ui-module-tile-head">
          <div className="ui-stack-sm">
            {icon ? (
              tone ? (
                <TagoraIconBadge tone={tone} size="lg">
                  {icon}
                </TagoraIconBadge>
              ) : (
                <div
                  className="ui-module-tile-icon"
                  style={accent ? { background: accent } : undefined}
                >
                  {icon}
                </div>
              )
            ) : null}
            <span className="ui-eyebrow">{eyebrow}</span>
            <h3 className="ui-module-tile-title">{title}</h3>
          </div>
          {badge ? <div className="ui-module-tile-badge">{badge}</div> : null}
        </div>
        <p className="ui-module-tile-description">{description}</p>
        {footer ? <div className="ui-module-tile-footer">{footer}</div> : null}
      </div>
      <div className="ui-module-tile-action">{action}</div>
    </AppCard>
  );
}
