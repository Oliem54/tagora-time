"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearLocalAuthIfRefreshTokenDead,
  isAuthClientLockContentionError,
  runWithBrowserAuthReadLock,
  supabase,
} from "@/app/lib/supabase/client";
import {
  getRequiredPermissionForPath,
  hasUserPermission,
} from "@/app/lib/auth/permissions";
import {
  AppRole,
  getHomePathForRole,
  getLoginPathForRole,
  getPasswordChangePathForRole,
  getUserRole,
} from "@/app/lib/auth/roles";
import { hasPasswordChangeRequired } from "@/app/lib/auth/passwords";
import { getMandatoryMfaGate, postMfaAuditEvent } from "@/app/lib/auth/mfa.client";
import { isAuthMfaPath } from "@/app/lib/auth/mfa.shared";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

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
};

export default function AuthGate({
  areaRole,
  children,
  publicPaths = [],
  crossAreaReadPaths = [],
}: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed">("checking");
  const [missingPermission, setMissingPermission] = useState<string | null>(null);

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
  useEffect(() => {
    let cancelled = false;

    async function getUserOnce() {
      try {
        return await supabase.auth.getUser();
      } catch (e) {
        if (isAuthClientLockContentionError(e)) {
          return await supabase.auth.getUser();
        }
        throw e;
      }
    }

    async function evaluateAccess() {
      try {
        await runWithBrowserAuthReadLock(async () => {
          setMissingPermission(null);

          let { data, error: userError } = await getUserOnce();
          if (userError && isAuthClientLockContentionError(userError)) {
            const retry = await getUserOnce();
            data = retry.data;
            userError = retry.error;
          }
          if (await clearLocalAuthIfRefreshTokenDead(userError)) {
            if (cancelled) return;
            const second = await getUserOnce();
            data = second.data;
            userError = second.error;
          }
          const user = data.user;
          const role = getUserRole(user);

          if (cancelled) return;

          if (!user) {
            if (isPublicPath) {
              setStatus("allowed");
              return;
            }

            router.replace(getLoginPathForRole(areaRole));
            return;
          }

          if (!role) {
            await supabase.auth.signOut();

            if (!cancelled) {
              router.replace(getLoginPathForRole(areaRole));
            }
            return;
          }

          const roleMatchesArea =
            areaRole === "admin"
              ? role === "admin"
              : role === areaRole || (areaRole === "direction" && role === "admin");

          const crossReadOk =
            Boolean(crossAreaReadMatch) &&
            Boolean(role && crossAreaReadMatch?.roles.includes(role));

          if (!roleMatchesArea && !crossReadOk) {
            router.replace(getHomePathForRole(role));
            return;
          }

          const needsDirMfaGate =
            !crossReadOk && (role === "direction" || role === "admin");

          if (needsDirMfaGate && !isAuthMfaPath(pathname)) {
            const gate = await getMandatoryMfaGate(role);
            if (gate.kind === "setup") {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const portalPath =
                pathname.startsWith("/admin/") || pathname.startsWith("/direction/");
              if (
                portalPath &&
                typeof window !== "undefined" &&
                !sessionStorage.getItem("tagora_mfa_gate_audit")
              ) {
                sessionStorage.setItem("tagora_mfa_gate_audit", "1");
                void postMfaAuditEvent("mfa_access_blocked", session?.access_token ?? null);
              }
              router.replace("/auth/mfa/setup?required=1");
              return;
            }
            if (gate.kind === "verify") {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const portalPath =
                pathname.startsWith("/admin/") || pathname.startsWith("/direction/");
              if (
                portalPath &&
                typeof window !== "undefined" &&
                !sessionStorage.getItem("tagora_mfa_gate_audit")
              ) {
                sessionStorage.setItem("tagora_mfa_gate_audit", "1");
                void postMfaAuditEvent("mfa_access_blocked", session?.access_token ?? null);
              }
              router.replace("/auth/mfa/verify");
              return;
            }
          }

          if (isPublicPath) {
            router.replace(getHomePathForRole(role));
            return;
          }

          if (
            areaRole === "employe" &&
            hasPasswordChangeRequired(user) &&
            pathname !== getPasswordChangePathForRole(role)
          ) {
            router.replace(getPasswordChangePathForRole(role));
            return;
          }

          const requiredPermission = getRequiredPermissionForPath(pathname);

          if (requiredPermission && !hasUserPermission(user, requiredPermission)) {
            setMissingPermission(requiredPermission);
            router.replace(getHomePathForRole(role));
            return;
          }

          setStatus("allowed");
        });
      } catch (e) {
        if (isAuthClientLockContentionError(e)) {
          if (!cancelled) {
            void Promise.resolve().then(() => {
              if (!cancelled) void evaluateAccess();
            });
          }
          return;
        }
        if (cancelled) return;
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }
        if (isPublicPath) {
          setStatus("allowed");
        } else {
          router.replace(getLoginPathForRole(areaRole));
        }
      }
    }

    void evaluateAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void evaluateAccess();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [areaRole, crossAreaReadMatch, isPublicPath, pathname, router]);

  if (status === "allowed") {
    return <>{children}</>;
  }

  return (
    <TagoraLoadingScreen
      isLoading
      message={missingPermission ? "Validation de vos accès..." : "Initialisation de TAGORA..."}
      fullScreen
    />
  );
}
