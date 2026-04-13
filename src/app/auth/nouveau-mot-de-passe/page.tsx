"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordUpdateSection from "@/app/components/auth/PasswordUpdateSection";
import PageHeader from "@/app/components/ui/PageHeader";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { getLoginPathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";

function hasRecoverySignal() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return (
    searchParams.get("mode") === "recovery" ||
    hashParams.get("type") === "recovery" ||
    searchParams.get("type") === "recovery" ||
    hashParams.has("access_token") ||
    searchParams.has("access_token") ||
    searchParams.has("code")
  );
}

function hasRecoveryError() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return (
    hashParams.has("error") ||
    hashParams.has("error_code") ||
    searchParams.has("error") ||
    searchParams.has("error_code")
  );
}

function NewPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "direction" ? "direction" : "employe";
  const [loading, setLoading] = useState(true);
  const [validRecovery, setValidRecovery] = useState(false);

  const loginPath = useMemo(() => getLoginPathForRole(role), [role]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    async function initRecovery() {
      const recoverySignal = hasRecoverySignal();
      const recoveryError = hasRecoveryError();
      const code = searchParams.get("code");

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (!isMounted) {
          return;
        }

        if (event === "PASSWORD_RECOVERY") {
          setValidRecovery(true);
          setLoading(false);
        }
      });

      unsubscribe = () => subscription.unsubscribe();

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            if (isMounted) {
              setValidRecovery(false);
            }
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        setValidRecovery(Boolean(session) && recoverySignal && !recoveryError);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void initRecovery();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [searchParams]);

  async function handleRecoverySuccess() {
    const { data } = await supabase.auth.getUser();
    const nextRole = getUserRole(data.user) ?? role;

    await supabase.auth.signOut();
    router.replace(`${getLoginPathForRole(nextRole)}?reset=ok`);
  }

  if (loading) {
    return (
      <main className="ui-auth-shell">
        <div className="ui-auth-content" style={{ maxWidth: 680 }}>
          <PageHeader title="Nouveau mot de passe" subtitle="Chargement" compact />
          <SectionCard title="Chargement" subtitle="Verification du lien." />
        </div>
      </main>
    );
  }

  if (!validRecovery) {
    return (
      <main className="ui-auth-shell">
        <div className="ui-auth-content" style={{ maxWidth: 680 }}>
          <PageHeader title="Nouveau mot de passe" subtitle="Lien invalide." compact />
          <SectionCard title="Lien invalide ou expire" subtitle="Demandez un nouveau lien.">
            <div className="tagora-actions">
              <SecondaryButton onClick={() => router.replace(`/reinitialiser-mot-de-passe?role=${role}`)}>
                Reinitialiser
              </SecondaryButton>
              <SecondaryButton onClick={() => router.replace(loginPath)}>
                Retour
              </SecondaryButton>
            </div>
          </SectionCard>
        </div>
      </main>
    );
  }

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content" style={{ maxWidth: 680 }}>
        <PageHeader
          title="Nouveau mot de passe"
          subtitle="Choisissez un nouveau mot de passe."
          compact
        />

        <PasswordUpdateSection
          title="Nouveau mot de passe"
          subtitle="Confirmation."
          submitLabel="Enregistrer"
          successMessage="Mot de passe mis a jour."
          requireCurrentPassword={false}
          showPolicyHint={false}
          onSuccess={handleRecoverySuccess}
        />
      </div>
    </main>
  );
}

export default function NewPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="ui-auth-shell">
          <div className="ui-auth-content" style={{ maxWidth: 680 }}>
            <PageHeader title="Nouveau mot de passe" subtitle="Chargement" compact />
            <SectionCard title="Chargement" subtitle="Preparation." />
          </div>
        </main>
      }
    >
      <NewPasswordPageContent />
    </Suspense>
  );
}
