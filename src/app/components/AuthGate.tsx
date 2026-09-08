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
import { fetchSessionAuthorizationContext } from "@/app/lib/auth/session-context.client";
import { clearServerSessionCookie } from "@/app/lib/auth/session-cookie";
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
  /** Routes où un rôle hors zone peut quand même voir la page (message côté client). */
  wrongRoleRenderPaths?: string[];
};

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

      setStatus("allowed");
    }

    async function evaluateAccess() {
      try {
        setMissingPermission(null);
        let brokeredCtx: Awaited<ReturnType<typeof fetchSessionAuthorizationContext>> | null =
          null;
        try {
          brokeredCtx = await fetchSessionAuthorizationContext();
        } catch {
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
          await supabase.auth.signOut({ scope: "local" });
          await clearServerSessionCookie();
        } catch {
          // Best-effort leftover Supabase/JWT clear.
        }

        if (cancelled) return;
        if (isPublicPath) {
          setStatus("allowed");
          return;
        }
        router.replace(getLoginPathForRole(areaRole));
      } catch {
        if (cancelled) return;
        if (isPublicPath) {
          setStatus("allowed");
        } else {
          router.replace(getLoginPathForRole(areaRole));
        }
      }
    }

    void evaluateAccess();
    return () => {
      cancelled = true;
    };
  }, [areaRole, crossAreaReadMatch, isPublicPath, pathname, router, wrongRoleRenderOk]);

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
