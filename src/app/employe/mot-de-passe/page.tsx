"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PasswordUpdateSection from "@/app/components/auth/PasswordUpdateSection";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { hasPasswordChangeRequired } from "@/app/lib/auth/passwords";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";

export default function EmployePasswordPage() {
  const router = useRouter();
  const { user, loading } = useCurrentAccess();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/employe/login");
    }
  }, [loading, router, user]);

  async function handleSuccess() {
    router.replace("/employe/dashboard");
  }

  if (loading || !user) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <AuthenticatedPageHeader title="Changer le mot de passe" subtitle="Chargement" />
          <SectionCard title="Chargement" subtitle="Verification de la session." />
        </div>
      </main>
    );
  }

  const forced = hasPasswordChangeRequired(user);

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 880 }}>
        <AuthenticatedPageHeader
          title="Changer le mot de passe"
          subtitle={forced ? "Modification requise." : "Modification manuelle."}
        />

        {forced ? (
          <SectionCard
            title="Acces temporairement bloque"
            subtitle="Modifiez votre mot de passe pour continuer."
            tone="muted"
          />
        ) : null}

        <PasswordUpdateSection
          title="Nouveau mot de passe"
          subtitle="Validez votre acces avec un mot de passe personnel."
          submitLabel="Confirmer"
          successMessage="Mot de passe mis a jour."
          onSuccess={handleSuccess}
        />
      </div>
    </main>
  );
}
