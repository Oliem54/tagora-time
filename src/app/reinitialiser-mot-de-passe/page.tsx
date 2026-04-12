"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import PasswordUpdateSection from "@/app/components/auth/PasswordUpdateSection";
import AppCard from "@/app/components/ui/AppCard";
import FormField from "@/app/components/ui/FormField";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { getLoginPathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";

function getRecoveryHintFromUrl() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery")
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "direction" ? "direction" : "employe";
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [sending, setSending] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loadingRecovery, setLoadingRecovery] = useState(true);

  const loginPath = useMemo(() => getLoginPathForRole(role), [role]);

  useEffect(() => {
    const initialRecovery = getRecoveryHintFromUrl();
    setRecoveryMode(initialRecovery);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && initialRecovery) {
        setRecoveryMode(true);
      }
      setLoadingRecovery(false);
    });

    if (!initialRecovery) {
      setLoadingRecovery(false);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleResetEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    setMessageType(null);

    try {
      const redirectBase =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
        window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${redirectBase}/reinitialiser-mot-de-passe?role=${role}`,
      });

      if (error) {
        setMessage(error.message);
        setMessageType("error");
        return;
      }

      setMessage("Lien envoye. Verifiez votre courriel.");
      setMessageType("success");
    } finally {
      setSending(false);
    }
  }

  async function handleRecoverySuccess() {
    const { data } = await supabase.auth.getUser();
    const nextRole = getUserRole(data.user) ?? role;

    await supabase.auth.signOut();
    router.replace(`${getLoginPathForRole(nextRole)}?reset=ok`);
  }

  if (loadingRecovery) {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content" style={{ maxWidth: 920 }}>
          <PageHeader title="Reinitialiser le mot de passe" subtitle="Chargement" />
          <SectionCard title="Chargement" subtitle="Verification du lien." />
        </div>
      </main>
    );
  }

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content" style={{ maxWidth: 920 }}>
        <PageHeader
          title="Reinitialiser le mot de passe"
          subtitle={recoveryMode ? "Nouveau mot de passe." : "Lien par courriel."}
          compact
        />

        <div className="ui-auth-grid">
          {recoveryMode ? (
            <PasswordUpdateSection
              title="Nouveau mot de passe"
              subtitle="Confirmation."
              submitLabel="Reinitialiser le mot de passe"
              successMessage="Mot de passe reinitialise."
              requireCurrentPassword={false}
              onSuccess={handleRecoverySuccess}
            />
          ) : (
            <SectionCard
              title="Courriel de reinitialisation"
              subtitle="Adresse courriel."
            >
              <div className="ui-stack-md">
                <FeedbackMessage message={message} type={messageType} />

                <form className="tagora-form-grid" onSubmit={handleResetEmail}>
                  <FormField label="Adresse courriel">
                    <input
                      className="tagora-input"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="votre@courriel.com"
                    />
                  </FormField>

                  <div className="tagora-actions">
                    <PrimaryButton type="submit" disabled={sending}>
                      {sending ? "Envoi..." : "Reinitialiser"}
                    </PrimaryButton>
                    <SecondaryButton onClick={() => router.push(loginPath)}>
                      Retour
                    </SecondaryButton>
                  </div>
                </form>
              </div>
            </SectionCard>
          )}

          <AppCard className="ui-auth-panel">
            <div className="ui-stack-sm">
              <span className="ui-eyebrow">Acces</span>
              <h2 className="ui-section-card-title">Connexion</h2>
              <p className="ui-text-muted" style={{ margin: 0 }}>
                Retour apres la mise a jour.
              </p>
            </div>

            <Link href={loginPath} className="tagora-dark-outline-action" style={{ width: "100%" }}>
              Retour a la connexion
            </Link>
          </AppCard>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="tagora-app-shell">
          <div className="tagora-app-content" style={{ maxWidth: 920 }}>
            <PageHeader
              title="Reinitialiser le mot de passe"
              subtitle="Chargement"
            />
            <SectionCard title="Chargement" subtitle="Preparation du lien." />
          </div>
        </main>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}
