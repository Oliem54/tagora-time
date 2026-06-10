"use client";

import type { ReactNode } from "react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import HorodateurDirectionModuleNav, {
  type HorodateurDirectionModuleNavActive,
} from "@/app/direction/horodateur/HorodateurDirectionModuleNav";

type HorodateurDirectionPageShellProps = {
  active: HorodateurDirectionModuleNavActive;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function HorodateurDirectionPageShell({
  active,
  subtitle,
  actions,
  children,
}: HorodateurDirectionPageShellProps) {
  return (
    <main className="tagora-app-shell tagora-horodateur-direction-page">
      <div className="tagora-app-content tagora-horodateur-direction-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Horodateur direction"
          subtitle={subtitle}
          showNavigation={false}
          navigation={<HorodateurDirectionModuleNav active={active} variant="header" />}
          actions={actions}
        />
        {children}
      </div>
    </main>
  );
}
