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
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

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
  }, [areaRole, isPublicPath, pathname, router]);

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
