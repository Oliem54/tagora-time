import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "./cn";
import UserIdentityBadge from "./UserIdentityBadge";

type PageHeaderProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  userIdentity?: string | null;
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
  compact?: boolean;
};

export default function PageHeader({
  title,
  subtitle,
  actions,
  userIdentity,
  logoSrc = "/logo.png",
  logoAlt = "Logo TAGORA",
  className,
  compact = false,
}: PageHeaderProps) {
  const hasText = Boolean(title || subtitle);

  return (
    <section
      className={cn("ui-page-header", compact && "ui-page-header-compact", className)}
    >
      <div className="ui-page-header-logo">
        <div className="ui-page-header-logo-shell">
          <Image
            src={logoSrc}
            alt={logoAlt}
            width={260}
            height={130}
            priority
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </div>

      {hasText ? (
        <div className="ui-page-header-copy">
          {title ? <h1 className="ui-page-header-title">{title}</h1> : null}
          {subtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
        </div>
      ) : null}

      {actions || userIdentity ? (
        <div className="ui-page-header-actions">
          {userIdentity ? <UserIdentityBadge value={userIdentity} /> : null}
          {actions}
        </div>
      ) : null}
    </section>
  );
}
