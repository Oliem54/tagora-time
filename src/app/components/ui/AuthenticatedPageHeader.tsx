"use client";

import { Suspense, type ComponentProps } from "react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import PageHeader, { type PageHeaderVariant } from "./PageHeader";
import TagoraPageNavigation from "./TagoraPageNavigation";

type AuthenticatedPageHeaderProps = Omit<
  ComponentProps<typeof PageHeader>,
  "userIdentity" | "navigation"
> & {
  showUserIdentity?: boolean;
  showNavigation?: boolean;
  navigation?: ComponentProps<typeof PageHeader>["navigation"];
  variant?: PageHeaderVariant;
};

export default function AuthenticatedPageHeader({
  showUserIdentity = true,
  showNavigation = true,
  navigation,
  variant = "default",
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
      variant={variant}
      navigation={resolvedNavigation}
      userIdentity={showUserIdentity ? user?.email ?? null : null}
      userRoleLabel={showUserIdentity ? roleLabel : null}
      userRole={showUserIdentity ? role : null}
    />
  );
}
