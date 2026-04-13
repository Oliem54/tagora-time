"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import FormField from "@/app/components/ui/FormField";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { getLoginPathForRole } from "@/app/lib/auth/roles";
import { supabase } from "@/app/lib/supabase/client";

function ResetPasswordRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "direction" ? "direction" : "employe";
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [sending, setSending] = useState(false);

  const loginPath = useMemo(() => getLoginPathForRole(role), [role]);

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
        redirectTo: `${redirectBase}/auth/nouveau-mot-de-passe?role=${role}&mode=recovery`,
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

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content" style={{ maxWidth: 760 }}>
        <PageHeader
          title="Reinitialiser le mot de passe"
          subtitle="Lien par courriel."
          compact
        />

        <SectionCard title="Courriel" subtitle="Adresse de votre compte.">
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
      </div>
    </main>
  );
}

export default function ResetPasswordRequestPage() {
  return (
    <Suspense
      fallback={
        <main className="tagora-app-shell">
          <div className="tagora-app-content" style={{ maxWidth: 760 }}>
            <PageHeader
              title="Reinitialiser le mot de passe"
              subtitle="Chargement"
            />
            <SectionCard title="Chargement" subtitle="Preparation." />
          </div>
        </main>
      }
    >
      <ResetPasswordRequestPageContent />
    </Suspense>
  );
}
