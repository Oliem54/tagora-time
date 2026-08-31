"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TimeLoginForm from "@/app/components/time-public/TimeLoginForm";
import TimeLoginShell from "@/app/components/time-public/TimeLoginShell";
import TimeRoleSwitchLink from "@/app/components/time-public/TimeRoleSwitchLink";
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
        writeBrowserSessionCookie(null);
        setMessage("Aucun role n'est defini sur ce compte Supabase.");
        setMessageType("error");
        return;
      }

      if (role !== "employe") {
        await supabase.auth.signOut();
        writeBrowserSessionCookie(null);
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
    <TimeLoginShell
      roleLabel="Employé"
      title="Connexion employé"
      description="Entrez vos identifiants pour accéder à votre espace TAGORA HORORA."
      showWordmark={false}
      logoSrc="/brand/horora/horora.png"
      footer={
        <>
          <TimeRoleSwitchLink target="direction" />
          <p className="time-public-account-request">
            Pas encore d’accès ?{" "}
            <Link href="/demande-compte?portal=employe" className="time-public-inline-link">
              Demander un compte
            </Link>
          </p>
        </>
      }
    >
      <TimeLoginForm
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        submitting={submitting}
        message={message}
        messageType={messageType}
        forgotPasswordHref={`/reinitialiser-mot-de-passe?role=employe${
          email ? `&email=${encodeURIComponent(email)}` : ""
        }`}
      />
    </TimeLoginShell>
  );
}
