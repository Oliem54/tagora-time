"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PasswordUpdateSection from "@/app/components/auth/PasswordUpdateSection";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import { supabase } from "@/app/lib/supabase/client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

export default function EmployeProfilPage() {
  const router = useRouter();
  const { user, loading, companyAccess } = useCurrentAccess();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/employe/login");
    }
  }, [loading, router, user]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/employe/login");
  }

  if (loading || !user) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Profil employe" />
          <SectionCard title="Chargement" subtitle="Profil en preparation." />
        </div>
      </main>
    );
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Profil employe"
          actions={
            <div style={{ display: "flex", gap: "var(--ui-space-3)", flexWrap: "wrap" }}>
              <SecondaryButton onClick={() => router.push("/employe/dashboard")}>
                Retour
              </SecondaryButton>
              <SecondaryButton onClick={handleLogout}>Se deconnecter</SecondaryButton>
            </div>
          }
        />

        <SectionCard title="Compte" subtitle="Informations principales.">
          <div className="ui-grid-2">
            <AppCard tone="muted">
              <InfoRow label="Role" value="Employe" />
            </AppCard>
            <AppCard tone="muted">
              <InfoRow
                label="Compagnie principale"
                value={getCompanyLabel(companyAccess.primaryCompany ?? companyAccess.company)}
              />
            </AppCard>
          </div>
        </SectionCard>

        <SectionCard
          title="Horaire prévu"
          subtitle="Demandes d’ajustement (validation direction)."
        >
          <SecondaryButton type="button" onClick={() => router.push("/employe/effectifs/demandes")}>
            Ouvrir mes demandes d’horaire
          </SecondaryButton>
        </SectionCard>

        <SectionCard
          title="Securite du compte"
          subtitle="Verification en deux etapes optionnelle pour les employes."
        >
          <Link className="ui-button ui-button-secondary" href="/account/security">
            Gerer la securite du compte
          </Link>
        </SectionCard>

        <PasswordUpdateSection
          title="Securite"
          subtitle="Mot de passe."
          submitLabel="Modifier le mot de passe"
          successMessage="Mot de passe modifie."
        />
      </div>
    </main>
  );
}
