"use client";

import type { ComponentProps } from "react";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import PageHeader from "./PageHeader";

type AuthenticatedPageHeaderProps = Omit<ComponentProps<typeof PageHeader>, "userIdentity"> & {
  showUserIdentity?: boolean;
};

export default function AuthenticatedPageHeader({
  showUserIdentity = true,
  ...props
}: AuthenticatedPageHeaderProps) {
  const { user } = useCurrentAccess();

  return (
    <PageHeader
      {...props}
      userIdentity={showUserIdentity ? user?.email ?? null : null}
    />
  );
}
