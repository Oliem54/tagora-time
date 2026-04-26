"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearLocalAuthIfRefreshTokenDead,
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

type AuthGateProps = {
  areaRole: AppRole;
  children: ReactNode;
  publicPaths?: string[];
};

export default function AuthGate({
  areaRole,
  children,
  publicPaths = [],
}: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed">("checking");
  const [missingPermission, setMissingPermission] = useState<string | null>(null);

  const isPublicPath = useMemo(
    () => publicPaths.includes(pathname),
    [pathname, publicPaths]
  );

  useEffect(() => {
    let cancelled = false;

    async function evaluateAccess() {
      setMissingPermission(null);
      let { data, error: userError } = await supabase.auth.getUser();
      if (await clearLocalAuthIfRefreshTokenDead(userError)) {
        ({ data, error: userError } = await supabase.auth.getUser());
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
        role === areaRole || (areaRole === "direction" && role === "admin");

      if (!roleMatchesArea) {
        router.replace(getHomePathForRole(role));
        return;
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
    }

    evaluateAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void evaluateAccess();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [areaRole, isPublicPath, pathname, router]);

  if (status === "allowed") {
    return <>{children}</>;
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content" style={{ maxWidth: 980 }}>
        <div className="tagora-panel">
          <h1 className="section-title" style={{ marginBottom: 10 }}>
            {missingPermission ? "Acces restreint" : "Verification de la session"}
          </h1>
          <p className="tagora-note">
            {missingPermission
              ? `La permission ${missingPermission} est requise pour ouvrir ce module. Redirection vers votre espace autorise.`
              : "Validation de votre acces et redirection vers le bon espace."}
          </p>
        </div>
      </div>
    </main>
  );
}
