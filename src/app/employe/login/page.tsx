"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, BadgeCheck, Clock3, FileStack, Waypoints } from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AppCard from "@/app/components/ui/AppCard";
import FormField from "@/app/components/ui/FormField";
import ModuleTile from "@/app/components/ui/ModuleTile";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import {
  getHomePathForRole,
  getPasswordChangePathForRole,
  getUserRole,
} from "@/app/lib/auth/roles";
import { hasPasswordChangeRequired } from "@/app/lib/auth/passwords";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";
import { devInfo } from "@/app/lib/logger";
import {
  getSupabaseBrowserLoginDebug,
  supabase,
} from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    searchParams.get("reset") === "ok"
      ? "Mot de passe reinitialise. Connectez-vous."
      : ""
  );
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    searchParams.get("reset") === "ok" ? "success" : null
  );
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    setMessage("");
    setMessageType(null);

    try {
      if (process.env.NODE_ENV === "development") {
        const d = getSupabaseBrowserLoginDebug();
        console.info("[employe-login] env", {
          hasUrl: d.hasUrl,
          hasResolvedKey: d.hasResolvedKey,
          hasAnonKey: d.hasAnonKey,
          hasPublishableKey: d.hasPublishableKey,
          host: d.host,
        });
      }

      let signInResult: Awaited<
        ReturnType<typeof supabase.auth.signInWithPassword>
      >;

      try {
        signInResult = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      } catch (caught) {
        const err = caught instanceof Error ? caught : new Error(String(caught));
        if (process.env.NODE_ENV === "development") {
          console.info("[employe-login] signIn threw", {
            name: err.name,
            message: err.message,
          });
        }
        setMessage(err.message || "Erreur reseau (connexion Supabase impossible).");
        setMessageType("error");
        return;
      }

      const { error } = signInResult;

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.info("[employe-login] signIn error", {
            name: error.name,
            message: error.message,
          });
        }
        setMessage(error.message);
        setMessageType("error");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        writeBrowserSessionCookie(session.access_token);
        devInfo(
          "auth-cookie",
          "login cookie written",
          buildAppSessionCookieWriteDebug(
            session.access_token,
            window.location.protocol === "https:"
          )
        );

        try {
          const syncResponse = await fetch("/api/account-requests/sync-activation", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          const syncPayload = await syncResponse.json().catch(() => null);
          devInfo("auth-cookie", "sync-activation response", syncPayload);
        } catch {
          // Le hook d acces refera la synchronisation sur le dashboard.
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      const role = getUserRole(userData.user);

      if (!role) {
        await supabase.auth.signOut();
        setMessage("Aucun role n'est defini sur ce compte Supabase.");
        setMessageType("error");
        return;
      }

      if (role !== "employe") {
        await supabase.auth.signOut();
        setMessage("Ce compte n'a pas acces au portail employe.");
        setMessageType("error");
        return;
      }

      setMessage("Connexion reussie.");
      setMessageType("success");
      sessionStorage.setItem("tagora_auth_portal", "employe");
      router.replace(
        hasPasswordChangeRequired(userData.user)
          ? getPasswordChangePathForRole(role)
          : getHomePathForRole(role)
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content">
        <PageHeader
          title="Connexion"
          subtitle="Acces employe."
          compact
        />

        <div className="ui-auth-grid">
          <SectionCard
            title="Portail"
            subtitle="Acces quotidien."
          >
            <div className="ui-stack-md">
              <span className="ui-hero-kicker">
                <BadgeCheck size={16} />
                Portail
              </span>
              <div className="ui-link-grid">
                <ModuleTile
                  eyebrow="Module"
                  title="Tableau de bord"
                  description="Vue d ensemble."
                  icon={<FileStack size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)"
                  action={<div className="ui-text-muted">Priorites et acces.</div>}
                />
                <ModuleTile
                  eyebrow="Module"
                  title="Terrain"
                  description="Terrain et livraisons."
                  icon={<Waypoints size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)"
                  footer={<span className="ui-text-muted">Suivi terrain.</span>}
                  action={<div className="ui-text-muted">Selon vos acces.</div>}
                />
                <ModuleTile
                  eyebrow="Module"
                  title="Horodateur"
                  description="Pointage rapide."
                  icon={<Clock3 size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(15,41,72,0.08) 100%)"
                  action={<div className="ui-text-muted">Acces direct.</div>}
                />
              </div>
            </div>
          </SectionCard>

          <AppCard className="ui-auth-panel ui-auth-form-card">
            <form className="ui-stack-md" onSubmit={handleLogin}>
              <div className="ui-stack-sm">
                <span className="ui-eyebrow">Authentification</span>
                <h2 className="ui-section-card-title">Se connecter</h2>
                <p className="ui-text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                  Tableau de bord et operations.
                </p>
              </div>

              <FeedbackMessage message={message} type={messageType} />

              <div className="tagora-form-grid">
                <FormField label="Adresse courriel">
                  <input
                    className="tagora-input"
                    placeholder="votre@courriel.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </FormField>

                <FormField label="Mot de passe">
                  <input
                    className="tagora-input"
                    placeholder="Votre mot de passe"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </FormField>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link
                  href={`/reinitialiser-mot-de-passe?role=employe${
                    email ? `&email=${encodeURIComponent(email)}` : ""
                  }`}
                  className="ui-text-muted"
                >
                  Mot de passe oublie ?
                </Link>
              </div>

              <div className="tagora-actions">
                <PrimaryButton type="submit" disabled={submitting}>
                  {submitting ? "Connexion..." : "Entrer"}
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => router.push("/")}>
                  Voir
                </SecondaryButton>
              </div>
            </form>

            <AppCard tone="muted" className="ui-stack-sm">
              <span className="ui-eyebrow">Acces</span>
              <p className="ui-text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                Demande d acces requise.
              </p>
              <Link href="/demande-compte?portal=employe" className="tagora-dark-outline-action" style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Acceder</span>
                <ArrowUpRight size={16} />
              </Link>
            </AppCard>
          </AppCard>
        </div>
      </div>
    </main>
  );
}
