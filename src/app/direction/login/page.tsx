"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, BriefcaseBusiness, ShieldCheck, UsersRound, Waypoints } from "lucide-react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import AppCard from "@/app/components/ui/AppCard";
import FormField from "@/app/components/ui/FormField";
import ModuleTile from "@/app/components/ui/ModuleTile";
import PageHeader from "@/app/components/ui/PageHeader";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { getHomePathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "../../lib/supabase/client";
import {
  getSafeSupabaseSession,
  getSafeSupabaseUser,
} from "@/app/lib/supabase/session";

export default function DirectionLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    searchParams.get("reset") === "ok" ? "Mot de passe reinitialise." : ""
  );
  const [messageType, setMessageType] = useState<"success" | "error" | null>(
    searchParams.get("reset") === "ok" ? "success" : null
  );

  const handleLogin = async () => {
    setMessage("");
    setMessageType(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setMessageType("error");
      return;
    }

    const { data: session } = await getSafeSupabaseSession();

    if (session?.access_token) {
      try {
        await fetch("/api/account-requests/sync-activation", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      } catch {
        // Le hook d acces refera la synchronisation sur le dashboard.
      }
    }

    const { data: user } = await getSafeSupabaseUser();
    const role = getUserRole(user);

    if (!role) {
      await supabase.auth.signOut();
      setMessage("Aucun role n'est defini sur ce compte Supabase.");
      setMessageType("error");
      return;
    }

    if (role !== "direction") {
      await supabase.auth.signOut();
      setMessage("Ce compte n'a pas acces au portail direction.");
      setMessageType("error");
      return;
    }

    setMessage("Connexion reussie.");
    setMessageType("success");
    router.replace(getHomePathForRole(role));
  };

  return (
    <main className="ui-auth-shell">
      <div className="ui-auth-content">
        <PageHeader
          title="Connexion"
          subtitle="Acces direction."
          compact
        />

        <div className="ui-auth-grid">
          <SectionCard
            title="Cockpit"
            subtitle="Acces direction."
          >
            <div className="ui-stack-md">
              <span className="ui-hero-kicker">
                <ShieldCheck size={16} />
                Supervision
              </span>
              <div className="ui-link-grid">
                <ModuleTile
                  eyebrow="Famille"
                  title="Operations terrain"
                  description="Terrain et flux."
                  icon={<Waypoints size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)"
                  action={<div className="ui-text-muted">Terrain.</div>}
                />
                <ModuleTile
                  eyebrow="Famille"
                  title="Gestion interne"
                  description="Documents et ressources."
                  icon={<BriefcaseBusiness size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(236,72,153,0.16) 0%, rgba(15,41,72,0.08) 100%)"
                  action={<div className="ui-text-muted">Gestion interne.</div>}
                />
                <ModuleTile
                  eyebrow="Famille"
                  title="Controle et comptes"
                  description="Demandes et controle."
                  icon={<UsersRound size={24} strokeWidth={2.1} />}
                  accent="linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(15,41,72,0.08) 100%)"
                  action={<div className="ui-text-muted">Actions admin.</div>}
                />
              </div>
            </div>
          </SectionCard>

          <AppCard className="ui-auth-panel ui-auth-form-card">
            <div className="ui-stack-sm">
              <span className="ui-eyebrow">Authentification</span>
              <h2 className="ui-section-card-title">Se connecter</h2>
              <p className="ui-text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                Tableau de bord et modules.
              </p>
            </div>

            <FeedbackMessage message={message} type={messageType} />

            <div className="tagora-form-grid">
              <FormField label="Adresse courriel">
                <input
                  className="tagora-input"
                  placeholder="direction@entreprise.com"
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
                href={`/reinitialiser-mot-de-passe?role=direction${
                  email ? `&email=${encodeURIComponent(email)}` : ""
                }`}
                className="ui-text-muted"
              >
                Mot de passe oublie ?
              </Link>
            </div>

            <div className="tagora-actions">
              <PrimaryButton onClick={handleLogin}>Entrer</PrimaryButton>
              <SecondaryButton onClick={() => router.push("/")}>Voir</SecondaryButton>
            </div>

            <AppCard tone="muted" className="ui-stack-sm">
              <span className="ui-eyebrow">Acces</span>
              <p className="ui-text-muted" style={{ margin: 0, lineHeight: 1.7 }}>
                Demande d acces requise.
              </p>
              <Link href="/demande-compte?portal=direction" className="tagora-dark-outline-action" style={{ width: "100%", justifyContent: "space-between" }}>
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
