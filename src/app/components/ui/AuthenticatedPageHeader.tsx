"use client";

import { Suspense, type ComponentProps } from "react";
import {
  HORORA_ACCESSIBLE_PRODUCT_NAME,
  HORORA_LIGHT_ASSET_PATH,
} from "@/app/lib/brand/horora-premium-2027";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { cn } from "./cn";
import PageHeader from "./PageHeader";
import TagoraPageNavigation from "./TagoraPageNavigation";

type AuthenticatedPageHeaderProps = Omit<
  ComponentProps<typeof PageHeader>,
  "userIdentity" | "navigation"
> & {
  showUserIdentity?: boolean;
  showNavigation?: boolean;
  navigation?: ComponentProps<typeof PageHeader>["navigation"];
};

export default function AuthenticatedPageHeader({
  showUserIdentity = true,
  showNavigation = true,
  navigation,
  className,
  logoSrc,
  logoAlt,
  ...props
}: AuthenticatedPageHeaderProps) {
  const { user, role } = useCurrentAccess();
  const resolvedNavigation =
    navigation ??
    (showNavigation ? (
      <Suspense fallback={null}>
        <TagoraPageNavigation />
      </Suspense>
    ) : null);
  const roleLabel =
    role === "employe"
      ? "Employé"
      : role === "direction"
        ? "Direction"
        : role === "admin"
          ? "Admin"
          : "Rôle non défini";

  return (
    <PageHeader
      {...props}
      className={cn("ui-page-header-premium-2027", className)}
      logoSrc={logoSrc ?? HORORA_LIGHT_ASSET_PATH}
      logoAlt={logoAlt ?? HORORA_ACCESSIBLE_PRODUCT_NAME}
      navigation={resolvedNavigation}
      userIdentity={showUserIdentity ? user?.email ?? null : null}
      userRoleLabel={showUserIdentity ? roleLabel : null}
      userRole={showUserIdentity ? role : null}
    />
  );
}
