"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AccessNotice from "@/app/components/AccessNotice";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { getHomePathForRole } from "@/app/lib/auth/roles";

type AdminFinanceGateProps = {
  children: ReactNode;
  /** Libelle affiche dans le message de refus (ex. Paie, Commissions). */
  moduleLabel?: string;
};

export default function AdminFinanceGate({ children, moduleLabel }: AdminFinanceGateProps) {
  const router = useRouter();
  const { user, role, loading } = useCurrentAccess();

  if (loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message={`Verification acces ${moduleLabel ?? "finance"}...`}
        fullScreen
      />
    );
  }

  if (!user || !hasAdminFinanceAccess(user)) {
    const home = role ? getHomePathForRole(role) : "/direction/login";
    return (
      <div className="page-container">
        <AccessNotice
          title="Acces reserve a l administration"
          description={
            moduleLabel
              ? `Le module ${moduleLabel} (donnees de paie, remuneration et confidentiel) est reserve au role admin. Utilisez l espace /admin. Les pages direction correspondantes seront remplacees en phase 2 par des vues operationnelles sans montants.`
              : "Ce module financier est reserve au role admin."
          }
        />
        <p style={{ marginTop: 16 }}>
          <button
            type="button"
            className="tagora-dark-action"
            onClick={() => router.replace(home)}
          >
            Retour a l accueil
          </button>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
