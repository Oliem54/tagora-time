"use client";

import { Suspense, type ComponentProps } from "react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
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
  showNavigation = false,
  navigation,
  ...props
}: AuthenticatedPageHeaderProps) {
  const { user } = useCurrentAccess();
  const resolvedNavigation =
    navigation ??
    (showNavigation ? (
      <Suspense fallback={null}>
        <TagoraPageNavigation />
      </Suspense>
    ) : null);

  return (
    <PageHeader
      {...props}
      navigation={resolvedNavigation}
      userIdentity={showUserIdentity ? user?.email ?? null : null}
    />
  );
}
