"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearLocalAuthIfRefreshTokenDead,
  isAuthClientLockContentionError,
  runWithBrowserAuthReadLock,
  supabase,
} from "@/app/lib/supabase/client";
import { fetchSessionAuthorizationContext } from "@/app/lib/auth/session-context.client";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";

export default function AccountAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await runWithBrowserAuthReadLock(async () => {
          let { data, error } = await supabase.auth.getUser();
          if (await clearLocalAuthIfRefreshTokenDead(error)) {
            ({ data, error } = await supabase.auth.getUser());
          }
          const user = data.user;

          if (cancelled) return;

          if (!user) {
            const portal =
              typeof window !== "undefined"
                ? sessionStorage.getItem("tagora_auth_portal")
                : null;
            router.replace(portal === "direction" ? "/direction/login" : "/employe/login");
            return;
          }

          const sessionRes = await supabase.auth.getSession();
          const accessToken = sessionRes.data.session?.access_token;
          if (!accessToken) {
            router.replace("/employe/login");
            return;
          }

          const ctx = await fetchSessionAuthorizationContext(accessToken);
          if (cancelled) return;

          if (!ctx.authorized || !ctx.appRole) {
            await supabase.auth.signOut();
            router.replace("/employe/login");
            return;
          }

          setAllowed(true);
        });
      } catch (e) {
        if (isAuthClientLockContentionError(e)) {
          void Promise.resolve().then(() => {
            if (!cancelled) void run();
          });
          return;
        }
        const portal =
          typeof window !== "undefined"
            ? sessionStorage.getItem("tagora_auth_portal")
            : null;
        router.replace(portal === "direction" ? "/direction/login" : "/employe/login");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return <TagoraLoadingScreen isLoading message="Chargement du compte..." fullScreen />;
  }

  return <>{children}</>;
}
