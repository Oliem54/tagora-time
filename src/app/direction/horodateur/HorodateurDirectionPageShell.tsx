"use client";

import type { ReactNode } from "react";
import HororaAppShell from "@/app/components/horora/HororaAppShell";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import type { HorodateurDirectionModuleNavActive } from "@/app/direction/horodateur/HorodateurDirectionModuleNav";

const PAGE_META: Record<
  HorodateurDirectionModuleNavActive,
  { title: string; crumb: string }
> = {
  live: { title: "Horodateur live", crumb: "Horodateur live" },
  registre: { title: "Registre", crumb: "Registre" },
  quarts: { title: "Quarts passés", crumb: "Quarts passés" },
  paie: { title: "Rapport comptable", crumb: "Rapport comptable" },
};

type HorodateurDirectionPageShellProps = {
  active: HorodateurDirectionModuleNavActive;
  title?: string;
  subtitle?: string;
  status?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  companyLabel?: string;
  hideWorkspaceHeader?: boolean;
  children: ReactNode;
};

export default function HorodateurDirectionPageShell({
  active,
  title,
  subtitle,
  status,
  primaryAction,
  actions,
  companyLabel,
  hideWorkspaceHeader = false,
  children,
}: HorodateurDirectionPageShellProps) {
  const meta = PAGE_META[active];
  const { role } = useCurrentAccess();

  return (
    <HororaAppShell
      workspace={role === "admin" ? "admin" : "direction"}
      active={active}
      title={title ?? meta.title}
      subtitle={subtitle}
      status={status}
      primaryAction={primaryAction}
      actions={actions}
      companyLabel={companyLabel}
      hideWorkspaceHeader={hideWorkspaceHeader}
    >
      {children}
    </HororaAppShell>
  );
}
