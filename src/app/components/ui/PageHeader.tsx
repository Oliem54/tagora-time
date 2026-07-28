import Image from "next/image";
import type { ReactNode } from "react";
import type { AppRole } from "@/app/lib/auth/roles";
import { cn } from "./cn";
import UserIdentityBadge from "./UserIdentityBadge";

export type PageHeaderVariant = "default" | "compact" | "module";

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
  /**
   * Shared authenticated-header contract:
   * - compact: premium shell, title-focused (dashboard-like)
   * - module: premium shell + optional eyebrow/subtitle/navigation (commissions-like)
   * - default: legacy non-premium layout
   */
  variant?: PageHeaderVariant;
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
  logoAlt = "Logo TAGORA Time",
  className,
  compact = false,
  variant = "default",
}: PageHeaderProps) {
  const legacyPremiumClass = className?.includes("ui-page-header-premium-2027") ?? false;
  const isPremiumHeader =
    variant === "compact" || variant === "module" || legacyPremiumClass;
  const isCompactVariant = variant === "compact" || (compact && variant === "default");
  const isModuleVariant = variant === "module";

  // Module variant keeps category/description on the premium shell.
  // Compact/default-premium hide empty chrome; non-premium keeps legacy eyebrow/subtitle.
  const showEyebrow =
    Boolean(eyebrow) && (isModuleVariant || (!isPremiumHeader && variant === "default"));
  const showSubtitle =
    Boolean(subtitle) && (isModuleVariant || (!isPremiumHeader && variant === "default"));
  const hasCopy = Boolean(showEyebrow || title || showSubtitle || navigation);

  /** Asset recadré (sans marges blanches) pour en-têtes premium — logo.png reste le master. */
  const effectiveLogoSrc =
    isPremiumHeader && logoSrc === "/logo.png" ? "/logo-header.png" : logoSrc;
  const logoWidth = isPremiumHeader ? 304 : 260;
  const logoHeight = isPremiumHeader ? 152 : 130;

  return (
    <section
      className={cn(
        "ui-page-header",
        isCompactVariant && "ui-page-header-compact",
        isPremiumHeader && "ui-page-header-premium-2027",
        variant === "compact" && "ui-page-header-variant-compact",
        variant === "module" && "ui-page-header-variant-module",
        className
      )}
      data-header-variant={variant}
    >
      <div className="ui-page-header-logo">
        <div className="ui-page-header-logo-shell">
          <Image
            src={effectiveLogoSrc}
            alt={logoAlt}
            width={logoWidth}
            height={logoHeight}
            priority
            className="ui-page-header-logo-image"
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
