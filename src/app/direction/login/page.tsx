"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TimeLoginForm from "@/app/components/time-public/TimeLoginForm";
import TimeLoginShell from "@/app/components/time-public/TimeLoginShell";
import TimeRoleSwitchLink from "@/app/components/time-public/TimeRoleSwitchLink";
import { getUserRole } from "@/app/lib/auth/roles";
import { resolvePostLoginNavigationPath } from "@/app/lib/auth/mfa.client";
import { writeBrowserSessionCookie } from "@/app/lib/auth/session-cookie";
import {
  getSupabaseBrowserLoginDebug,
  probeSupabaseAuthSettingsReachable,
  supabase,
} from "../../lib/supabase/client";

const isDev = process.env.NODE_ENV === "development";
/** Visible only with explicit local flag — never Preview/Production by default. */
const showLoginDiag =
  isDev && process.env.NEXT_PUBLIC_SHOW_LOGIN_DIAG === "1";
const DEV_PROBE_TIMEOUT_MS = 5000;
const SIGN_IN_TIMEOUT_MS = 20000;

type LoginDebugEnv = ReturnType<typeof getSupabaseBrowserLoginDebug> & {
  localOrigin: string;
  localPort: string;
};

type ProbeResult = Awaited<ReturnType<typeof probeSupabaseAuthSettingsReachable>> & {
  timedOut?: boolean;
};

async function probeSupabaseAuthSettingsWithTimeout(): Promise<ProbeResult> {
  const settingsUrl =
    getSupabaseBrowserLoginDebug().settingsUrl ??
    `${getSupabaseBrowserLoginDebug().host ?? "supabase"}/auth/v1/settings`;

  try {
    const result = await Promise.race([
      probeSupabaseAuthSettingsReachable(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PROBE_TIMEOUT")), DEV_PROBE_TIMEOUT_MS);
      }),
    ]);
    return result;
  } catch (caught) {
    if (caught instanceof Error && caught.message === "PROBE_TIMEOUT") {
      return {
        url: settingsUrl,
        ok: false,
        fetchErrorName: "ProbeTimeout",
        fetchErrorMessage: `Timeout apres ${DEV_PROBE_TIMEOUT_MS / 1000}s — probe ignore, login continue.`,
        timedOut: true,
      };
    }

    const err = caught instanceof Error ? caught : new Error(String(caught));
    return {
      url: settingsUrl,
      ok: false,
      fetchErrorName: err.name,
      fetchErrorMessage: err.message,
    };
  }
}

async function signInWithPasswordWithTimeout(email: string, password: string) {
  return Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `Supabase Auth ne repond pas (timeout ${SIGN_IN_TIMEOUT_MS / 1000}s). Verifiez le reseau ou le statut Supabase, puis reessayez.`
            )
          ),
        SIGN_IN_TIMEOUT_MS
      );
    }),
  ]);
}

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

  const [debugEnv, setDebugEnv] = useState<LoginDebugEnv | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [signInThrow, setSignInThrow] = useState<{ name: string; message: string } | null>(null);
  const [authApiErr, setAuthApiErr] = useState<{ name: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!showLoginDiag) {
      return;
    }

    let cancelled = false;

    async function runInitialProbe() {
      const d = getSupabaseBrowserLoginDebug();
      setDebugEnv({
        ...d,
        localOrigin: window.location.origin,
        localPort: window.location.port || "(port par defaut)",
      });
      const p = await probeSupabaseAuthSettingsWithTimeout();
      if (!cancelled) {
        setProbeResult(p);
      }
    }

    void runInitialProbe();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    setMessage("");
    setMessageType(null);
    setSignInThrow(null);
    setAuthApiErr(null);

    try {
      if (showLoginDiag) {
        const d = getSupabaseBrowserLoginDebug();
        setDebugEnv({
          ...d,
          localOrigin: window.location.origin,
          localPort: window.location.port || "(port par defaut)",
        });
        const probe = await probeSupabaseAuthSettingsWithTimeout();
        setProbeResult(probe);
      }
      let signInResult: Awaited<
        ReturnType<typeof supabase.auth.signInWithPassword>
      >;

      try {
        signInResult = await signInWithPasswordWithTimeout(email, password);
      } catch (caught) {
        const err = caught instanceof Error ? caught : new Error(String(caught));
        if (showLoginDiag) {
          setSignInThrow({ name: err.name, message: err.message });
        }
        setMessage(err.message || "Erreur reseau (connexion Supabase impossible).");
        setMessageType("error");
        return;
      }

      const { error } = signInResult;

      if (error) {
        if (showLoginDiag) {
          setAuthApiErr({ name: error.name, message: error.message });
        }
        setMessage(error.message);
        setMessageType("error");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        writeBrowserSessionCookie(null);
        console.info("[auth-cookie] login cookie deferred until AAL2 MFA");

        try {
          const syncResponse = await fetch("/api/account-requests/sync-activation", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          const syncPayload = await syncResponse.json().catch(() => null);
          console.info("[auth-cookie] sync-activation response", syncPayload);
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

      if (role !== "direction" && role !== "admin") {
        await supabase.auth.signOut();
        setMessage("Ce compte n'a pas acces au portail direction.");
        setMessageType("error");
        return;
      }

      setMessage("Connexion reussie.");
      setMessageType("success");
      sessionStorage.setItem("tagora_auth_portal", "direction");
      const nextPath = await resolvePostLoginNavigationPath(role);
      router.replace(nextPath);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TimeLoginShell
      roleLabel="Direction"
      title="Connexion direction"
      description="Entrez vos identifiants pour accéder au pilotage TAGORA HORORA."
      footer={
        <>
          <TimeRoleSwitchLink target="employe" />
          <p className="time-public-account-request">
            Pas encore d’accès ?{" "}
            <Link href="/demande-compte?portal=direction" className="time-public-inline-link">
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
        forgotPasswordHref={`/reinitialiser-mot-de-passe?role=direction${
          email ? `&email=${encodeURIComponent(email)}` : ""
        }`}
        footer={
          showLoginDiag ? (
            <div
              className="time-public-dev-panel"
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 10,
                border: "1px solid #fdba74",
                background: "#fffbeb",
                fontSize: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                lineHeight: 1.5,
                color: "#1c1917",
                wordBreak: "break-word",
              }}
            >
              <strong style={{ display: "block", marginBottom: 10, fontSize: 13 }}>
                Diagnostic dev (NODE_ENV=development + NEXT_PUBLIC_SHOW_LOGIN_DIAG=1)
              </strong>

              {debugEnv ? (
                <div style={{ marginBottom: 10 }}>
                  <div>hasUrl: {String(debugEnv.hasUrl)}</div>
                  <div>hasResolvedKey: {String(debugEnv.hasResolvedKey)}</div>
                  <div>hasAnonKey: {String(debugEnv.hasAnonKey)}</div>
                  <div>hasPublishableKey: {String(debugEnv.hasPublishableKey)}</div>
                  <div>host Supabase: {debugEnv.host ?? "(null)"}</div>
                  <div>port local: {debugEnv.localPort}</div>
                  <div>origin local: {debugEnv.localOrigin}</div>
                  <div style={{ marginTop: 6 }}>
                    GET attendu (probe): {debugEnv.settingsUrl ?? "—"}
                  </div>
                  <div>POST attendu (signIn): {debugEnv.passwordGrantUrl ?? "—"}</div>
                </div>
              ) : (
                <div style={{ marginBottom: 10 }}>Chargement env…</div>
              )}

              <div style={{ marginBottom: 10 }}>
                <strong>Test GET /auth/v1/settings (avant signInWithPassword)</strong>
                {probeResult ? (
                  <>
                    <div>
                      Resultat:{" "}
                      {probeResult.fetchErrorMessage
                        ? "ECHEC (reseau / navigateur / extension)"
                        : probeResult.ok
                          ? "OK HTTP"
                          : "KO HTTP"}
                    </div>
                    {probeResult.url ? <div>URL: {probeResult.url}</div> : null}
                    {probeResult.status != null ? (
                      <div>
                        status: {probeResult.status} {probeResult.statusText ?? ""}
                      </div>
                    ) : null}
                    {probeResult.timedOut ? (
                      <div style={{ color: "#b45309", marginTop: 6 }}>
                        Probe dev coupe apres {DEV_PROBE_TIMEOUT_MS / 1000}s pour ne pas bloquer
                        le bouton. signInWithPassword est lance quand meme.
                      </div>
                    ) : null}
                    {probeResult.fetchErrorName ? (
                      <div style={{ color: "#b91c1c" }}>
                        Erreur fetch: {probeResult.fetchErrorName}: {probeResult.fetchErrorMessage}
                      </div>
                    ) : null}
                    {probeResult.fetchErrorMessage == null && probeResult.status === 504 ? (
                      <div style={{ color: "#b45309" }}>
                        HTTP 504 — Supabase Auth injoignable ou en surcharge. Le login tente quand
                        meme signInWithPassword.
                      </div>
                    ) : null}
                    {probeResult.fetchErrorMessage == null && probeResult.status === 401 ? (
                      <div style={{ color: "#b45309" }}>
                        Indice: HTTP 401 — verifier que la cle anon/publishable correspond au
                        meme projet que NEXT_PUBLIC_SUPABASE_URL.
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div>Probe en cours…</div>
                )}
              </div>

              <div>
                <strong>signInWithPassword</strong>
                {signInThrow ? (
                  <div style={{ color: "#b91c1c" }}>
                    Exception: {signInThrow.name}: {signInThrow.message}
                    {probeResult && !probeResult.fetchErrorMessage && signInThrow.message.includes("fetch") ? (
                      <div style={{ marginTop: 6, color: "#1c1917" }}>
                        Si le probe GET a reussi mais signIn echoue encore: comparer Network (token)
                        avec @supabase/supabase-js; sinon client deja valide et cause ailleurs.
                      </div>
                    ) : null}
                  </div>
                ) : authApiErr ? (
                  <div style={{ color: "#b45309" }}>
                    AuthApiError (requete partie): {authApiErr.name}: {authApiErr.message}
                  </div>
                ) : (
                  <div>(apres clic sur Entrer si erreur)</div>
                )}
              </div>
            </div>
          ) : null
        }
      />
    </TimeLoginShell>
  );
}
