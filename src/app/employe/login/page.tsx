"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import { getHomePathForRole, getUserRole } from "@/app/lib/auth/roles";
import { supabase } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const handleLogin = async () => {
    setMessage("");
    setMessageType(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

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
    router.replace(getHomePathForRole(role));
  };

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 980 }}>
        <HeaderTagora
          title="Connexion employe"
          subtitle="Accedez a votre espace depuis l'entree de connexion canonique."
        />

        <div className="tagora-panel" style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Se connecter
          </h2>

          <p className="tagora-note" style={{ marginBottom: 24 }}>
            Connectez-vous pour acceder a votre tableau de bord, vos sorties terrain et vos documents.
          </p>

          <p className="tagora-note" style={{ marginBottom: 20 }}>
            Pas encore d acces ? Soumettez une demande de creation de compte. Aucun acces ne sera ouvert avant validation par la direction.
          </p>

          <FeedbackMessage message={message} type={messageType} />

          <div className="tagora-form-grid">
            <div>
              <label className="tagora-field-label">Adresse courriel</label>
              <input
                className="tagora-input"
                placeholder="votre@courriel.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="tagora-field-label">Mot de passe</label>
              <input
                className="tagora-input"
                placeholder="Votre mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="tagora-actions" style={{ marginTop: 24 }}>
            <button className="tagora-btn tagora-btn-primary" onClick={handleLogin}>
              Connexion
            </button>

            <Link
              href="/"
              className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
            >
              Retour accueil
            </Link>

            <Link
              href="/demande-compte?portal=employe"
              className="tagora-dark-outline-action rounded-xl border px-5 py-3 text-sm font-medium transition"
            >
              Creer un compte
            </Link>
          </div>

          <p
            className="tagora-note"
            style={{
              marginTop: 36,
              paddingTop: 20,
              borderTop: "1px solid rgba(15, 23, 42, 0.08)",
              textAlign: "center",
              maxWidth: 420,
              marginInline: "auto",
              fontSize: 13,
              lineHeight: 1.8,
              color: "#526174",
            }}
          >
            Tagora centralise les operations, structure les demandes et offre une visibilite claire a chaque niveau de l organisation.
          </p>
        </div>
      </div>
    </main>
  );
}
