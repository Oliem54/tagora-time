import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "./cn";
import UserIdentityBadge from "./UserIdentityBadge";

type PageHeaderProps = {
  title?: string;
  subtitle?: string;
  navigation?: ReactNode;
  actions?: ReactNode;
  userIdentity?: string | null;
  userRoleLabel?: string | null;
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
  compact?: boolean;
};

export default function PageHeader({
  title,
  subtitle,
  navigation,
  actions,
  userIdentity,
  userRoleLabel,
  logoSrc = "/logo.png",
  logoAlt = "Logo TAGORA",
  className,
  compact = false,
}: PageHeaderProps) {
  const hasCopy = Boolean(title || subtitle || navigation);

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

      {hasCopy ? (
        <div className="ui-page-header-copy">
          {title ? <h1 className="ui-page-header-title">{title}</h1> : null}
          {subtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
          {navigation ? (
            <div className="ui-page-header-navigation">{navigation}</div>
          ) : null}
        </div>
      ) : null}

      {actions || userIdentity ? (
        <div className="ui-page-header-actions">
          {userIdentity ? (
            <UserIdentityBadge value={userIdentity} roleLabel={userRoleLabel} />
          ) : null}
          {actions}
        </div>
      ) : null}
    </section>
  );
}
