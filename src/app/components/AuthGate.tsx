"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import {
  getRequiredPermissionForPath,
} from "@/app/lib/auth/permissions";
import {
  AppRole,
  getHomePathForRole,
  getLoginPathForRole,
} from "@/app/lib/auth/roles";
import { appRoleMatchesArea } from "@/app/lib/auth/organization-role-mapping.shared";
import {
  fetchSessionAuthorizationContext,
  isSessionContextTimeoutError,
  SESSION_CONTEXT_TIMEOUT_MS,
} from "@/app/lib/auth/session-context.client";
import { clearServerSessionCookie } from "@/app/lib/auth/session-cookie";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import {
  AUTH_GATE_INIT_FAILURE_MESSAGE,
  AUTH_GATE_INIT_TIMEOUT_MS,
  resolveAuthGateInitView,
} from "@/app/components/auth-gate-init.shared";

type CrossAreaReadRule = {
  pathPrefix: string;
  roles: AppRole[];
};

type AuthGateProps = {
  areaRole: AppRole;
  children: ReactNode;
  publicPaths?: string[];
  /** Accès lecture pour d’autres rôles (ex. employés sur une route sous /direction). */
  crossAreaReadPaths?: CrossAreaReadRule[];
  /** Routes où un rôle hors zone peut quand même voir la page (message côté client). */
  wrongRoleRenderPaths?: string[];
};

const LEFTOVER_SESSION_CLEAR_TIMEOUT_MS = 4_000;

export default function AuthGate({
  areaRole,
  children,
  publicPaths = [],
  crossAreaReadPaths = [],
  wrongRoleRenderPaths = [],
}: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed">("checking");
  const [missingPermission, setMissingPermission] = useState<string | null>(null);
  const [initFailed, setInitFailed] = useState(false);
  const [initAttempt, setInitAttempt] = useState(0);

  const isPublicPath = useMemo(
    () => publicPaths.includes(pathname),
    [pathname, publicPaths]
  );

  const crossAreaReadMatch = useMemo(
    () =>
      crossAreaReadPaths.find(
        (rule) =>
          pathname === rule.pathPrefix || pathname.startsWith(`${rule.pathPrefix}/`)
      ),
    [pathname, crossAreaReadPaths]
  );

  const wrongRoleRenderOk = useMemo(
    () =>
      wrongRoleRenderPaths.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      ),
    [pathname, wrongRoleRenderPaths]
  );
  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setInitFailed(true);
    }, AUTH_GATE_INIT_TIMEOUT_MS);

    function releaseInitWatchdog() {
      window.clearTimeout(timeout);
    }

    async function authorizeNexusHandoff(role: AppRole) {
      const roleMatchesArea = appRoleMatchesArea(areaRole, role);
      const crossReadOk =
        Boolean(crossAreaReadMatch) &&
        Boolean(role && crossAreaReadMatch?.roles.includes(role));

      if (!roleMatchesArea && !crossReadOk && !wrongRoleRenderOk) {
        router.replace(getHomePathForRole(role));
        return;
      }

      if (isPublicPath) {
        router.replace(getHomePathForRole(role));
        return;
      }

      const requiredPermission = getRequiredPermissionForPath(pathname);
      if (requiredPermission === "admin_finance") {
        setMissingPermission(requiredPermission);
        router.replace(getHomePathForRole(role));
        return;
      }

      releaseInitWatchdog();
      setInitFailed(false);
      setStatus("allowed");
    }

    async function clearLeftoverBrowserSession() {
      await Promise.race([
        (async () => {
          await supabase.auth.signOut({ scope: "local" });
          await clearServerSessionCookie();
        })(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, LEFTOVER_SESSION_CLEAR_TIMEOUT_MS);
        }),
      ]);
    }

    async function evaluateAccess() {
      try {
        setMissingPermission(null);
        setInitFailed(false);
        let brokeredCtx: Awaited<ReturnType<typeof fetchSessionAuthorizationContext>> | null =
          null;
        try {
          brokeredCtx = await fetchSessionAuthorizationContext(undefined, {
            timeoutMs: SESSION_CONTEXT_TIMEOUT_MS,
          });
        } catch (error) {
          if (cancelled) return;
          if (isSessionContextTimeoutError(error)) {
            setInitFailed(true);
            return;
          }
          brokeredCtx = null;
        }
        if (cancelled) return;
        if (
          brokeredCtx?.authorized &&
          brokeredCtx.source === "nexus_handoff" &&
          brokeredCtx.appRole
        ) {
          await authorizeNexusHandoff(brokeredCtx.appRole);
          return;
        }

        try {
          await clearLeftoverBrowserSession();
        } catch {
          // Best-effort leftover Supabase/JWT clear.
        }

        if (cancelled) return;
        if (isPublicPath) {
          releaseInitWatchdog();
          setInitFailed(false);
          setStatus("allowed");
          return;
        }
        router.replace(getLoginPathForRole(areaRole));
      } catch {
        if (cancelled) return;
        if (isPublicPath) {
          releaseInitWatchdog();
          setInitFailed(false);
          setStatus("allowed");
        } else {
          router.replace(getLoginPathForRole(areaRole));
        }
      }
    }

    void evaluateAccess();
    return () => {
      cancelled = true;
      releaseInitWatchdog();
    };
  }, [areaRole, crossAreaReadMatch, initAttempt, isPublicPath, pathname, router, wrongRoleRenderOk]);

  const initView = resolveAuthGateInitView({ status, initFailed });

  if (initView === "allowed") {
    return <>{children}</>;
  }

  if (initView === "retry") {
    return (
      <main className="tagora-app-shell">
        <div className="tagora-app-content">
          <p className="tagora-note">{AUTH_GATE_INIT_FAILURE_MESSAGE}</p>
          <button
            type="button"
            className="account-requests-toolbar-button"
            onClick={() => {
              setInitFailed(false);
              setStatus("checking");
              setInitAttempt((current) => current + 1);
            }}
          >
            Réessayer
          </button>
        </div>
      </main>
    );
  }

  return (
    <TagoraLoadingScreen
      isLoading
      message={missingPermission ? "Validation de vos accès..." : "Initialisation de TAGORA..."}
      fullScreen
    />
  );
}
