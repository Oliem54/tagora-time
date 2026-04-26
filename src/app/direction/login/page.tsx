"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
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
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";
import {
  getSupabaseBrowserLoginDebug,
  probeSupabaseAuthSettingsReachable,
  supabase,
} from "../../lib/supabase/client";

const isDev = process.env.NODE_ENV === "development";

type LoginDebugEnv = ReturnType<typeof getSupabaseBrowserLoginDebug> & {
  localOrigin: string;
  localPort: string;
};

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
  const [probeResult, setProbeResult] = useState<Awaited<
    ReturnType<typeof probeSupabaseAuthSettingsReachable>
  > | null>(null);
  const [signInThrow, setSignInThrow] = useState<{ name: string; message: string } | null>(null);
  const [authApiErr, setAuthApiErr] = useState<{ name: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isDev) {
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
      const p = await probeSupabaseAuthSettingsReachable();
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
      if (isDev) {
        const d = getSupabaseBrowserLoginDebug();
        setDebugEnv({
          ...d,
          localOrigin: window.location.origin,
          localPort: window.location.port || "(port par defaut)",
        });
        const probe = await probeSupabaseAuthSettingsReachable();
        setProbeResult(probe);
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
        if (isDev) {
          setSignInThrow({ name: err.name, message: err.message });
        }
        setMessage(err.message || "Erreur reseau (connexion Supabase impossible).");
        setMessageType("error");
        return;
      }

      const { error } = signInResult;

      if (error) {
        if (isDev) {
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
        writeBrowserSessionCookie(session.access_token);
        console.info(
          "[auth-cookie] login cookie written",
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
      router.replace(getHomePathForRole(role));
    } finally {
      setSubmitting(false);
    }
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
            <form className="ui-stack-md" onSubmit={handleLogin}>
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
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Connexion..." : "Entrer"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => router.push("/")}>Voir</SecondaryButton>
            </div>

            {isDev && (
              <div
                className="ui-stack-sm"
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
                  Diagnostic dev (visible uniquement en npm run dev)
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
                      {probeResult.fetchErrorName ? (
                        <div style={{ color: "#b91c1c" }}>
                          Erreur fetch: {probeResult.fetchErrorName}: {probeResult.fetchErrorMessage}
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
            )}
            </form>

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
