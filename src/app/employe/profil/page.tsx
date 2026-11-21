"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PasswordUpdateSection from "@/app/components/auth/PasswordUpdateSection";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getCompanyLabel } from "@/app/lib/account-requests.shared";
import { describeHororaEmployeeJourney } from "@/app/lib/auth/horora-premium-user-central.shared";
import { signOutToSwitchAccount } from "@/app/lib/auth/password-mfa.client";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import InfoRow from "@/app/components/ui/InfoRow";
import SecondaryButton from "@/app/components/ui/SecondaryButton";

const PROFILE_ROLE_LABEL = {
  employe: "Employé",
  direction: "Direction",
  organization_admin: "Administration d'organisation",
  organization_owner: "Propriétaire",
  admin: "Administration",
} as const;

export default function EmployeProfilPage() {
  const router = useRouter();
  const { user, role, membershipRole, sessionSource, organizationId, loading, companyAccess } =
    useCurrentAccess();
  const brokeredSession =
    sessionSource === "nexus_handoff" || sessionSource === "local_nexus_fixture";
  const journeyRole =
    membershipRole === "employe" || membershipRole === "direction" ? membershipRole : null;
  const journey = journeyRole ? describeHororaEmployeeJourney(journeyRole) : null;
  const roleLabel = membershipRole
    ? PROFILE_ROLE_LABEL[membershipRole]
    : role
      ? PROFILE_ROLE_LABEL[role]
      : "Rôle non résolu";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/employe/login");
    }
  }, [loading, router, user]);

  async function handleLogout() {
    const loginPath = await signOutToSwitchAccount();
    router.replace(loginPath);
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

        <SectionCard title="Compte" subtitle="Session limitée à une organisation.">
          <div className="ui-grid-2">
            <AppCard tone="muted">
              <InfoRow label="Rôle" value={roleLabel} />
            </AppCard>
            <AppCard tone="muted">
              <InfoRow
                label="Organisation"
                value={organizationId ?? "Organisation non résolue"}
              />
            </AppCard>
            <AppCard tone="muted">
              <InfoRow
                label="Compagnie d appartenance"
                value={getCompanyLabel(companyAccess.primaryCompany ?? companyAccess.company)}
              />
            </AppCard>
            <AppCard tone="muted">
              <InfoRow
                label="Droits du rôle"
                value={
                  journey
                    ? journey.rights.map((right) => right.label).join(", ")
                    : "Les droits d'administration restent dans Utilisateurs et permissions."
                }
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

        {brokeredSession ? (
          <SectionCard
            title="Identité"
            subtitle="Le mot de passe local reste inchangé."
          >
            <InfoRow label="Session" value="Session HORORA" />
          </SectionCard>
        ) : (
          <>
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
          </>
        )}
      </div>
    </main>
  );
}
