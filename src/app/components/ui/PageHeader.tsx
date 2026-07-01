import Image from "next/image";
import type { ReactNode } from "react";
import type { AppRole } from "@/app/lib/auth/roles";
import { cn } from "./cn";
import UserIdentityBadge from "./UserIdentityBadge";

type PageHeaderProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  navigation?: ReactNode;
  actions?: ReactNode;
  userIdentity?: string | null;
  userRoleLabel?: string | null;
  userRole?: AppRole | null;
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
  compact?: boolean;
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  navigation,
  actions,
  userIdentity,
  userRoleLabel,
  userRole,
  logoSrc = "/logo.png",
  logoAlt = "Logo TAGORA",
  className,
  compact = false,
}: PageHeaderProps) {
  const isPremiumHeader = className?.includes("ui-page-header-premium-2027");
  const showEyebrow = Boolean(eyebrow) && !isPremiumHeader;
  const showSubtitle = Boolean(subtitle) && !isPremiumHeader;
  const hasCopy = Boolean(showEyebrow || title || showSubtitle || navigation);

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
          {showEyebrow ? <p className="ui-page-header-eyebrow">{eyebrow}</p> : null}
          {title ? (
            <h1
              className={cn(
                "ui-page-header-title",
                isPremiumHeader && "ui-page-header-title-premium-2027"
              )}
            >
              {title}
            </h1>
          ) : null}
          {showSubtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
          {navigation ? (
            <div className="ui-page-header-navigation">{navigation}</div>
          ) : null}
        </div>
      ) : null}

      {actions || userIdentity ? (
        <div className="ui-page-header-actions">
          {userIdentity ? (
            <UserIdentityBadge value={userIdentity} roleLabel={userRoleLabel} role={userRole} />
          ) : null}
          {actions}
        </div>
      ) : null}
    </section>
  );
}
