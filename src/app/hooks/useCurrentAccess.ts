"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  clearLocalAuthIfRefreshTokenDead,
  runWithBrowserAuthReadLock,
  supabase,
} from "@/app/lib/supabase/client";
import { AppRole, getUserRole } from "@/app/lib/auth/roles";
import {
  AppPermission,
  getUserPermissions,
} from "@/app/lib/auth/permissions";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";
import { devInfo } from "@/app/lib/logger";
import {
  buildUserCompanyAccess,
  type UserCompanyAccess,
} from "@/app/lib/account-requests.shared";

type AccessState = {
  user: User | null;
  role: AppRole | null;
  permissions: AppPermission[];
  companyAccess: UserCompanyAccess;
  loading: boolean;
};

export function useCurrentAccess() {
  const [state, setState] = useState<AccessState>({
    user: null,
    role: null,
    permissions: [],
    companyAccess: buildUserCompanyAccess(null),
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function syncAccountActivation(retryDepth = 0) {
      try {
        let {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (await clearLocalAuthIfRefreshTokenDead(sessionError)) {
          ({
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession());
        }

        const token = session?.access_token;

        writeBrowserSessionCookie(token ?? null);
        devInfo(
          "auth-cookie",
          "refresh cookie written",
          buildAppSessionCookieWriteDebug(
            token ?? null,
            window.location.protocol === "https:"
          )
        );

        if (!token) {
          return;
        }

        try {
          const response = await fetch("/api/account-requests/sync-activation", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const payload = await response.json().catch(() => null);
          devInfo("auth-cookie", "refresh sync-activation response", payload);
        } catch {
          // Silent on purpose: access loading must keep working even if the sync endpoint is unavailable.
        }
      } catch (caught) {
        if (retryDepth > 0) return;
        const err = caught instanceof Error ? caught : new Error(String(caught));
        if (await clearLocalAuthIfRefreshTokenDead(err)) {
          await syncAccountActivation(1);
        }
      }
    }

    async function loadAccess(allowRetryAfterPurge = true) {
      try {
        await runWithBrowserAuthReadLock(async () => {
          await syncAccountActivation();

          let { data, error: userError } = await supabase.auth.getUser();
          if (await clearLocalAuthIfRefreshTokenDead(userError)) {
            ({ data, error: userError } = await supabase.auth.getUser());
          }
          const user = data.user;

          if (!user) {
            writeBrowserSessionCookie(null);
          }

          if (cancelled) return;

          setState({
            user,
            role: getUserRole(user),
            permissions: getUserPermissions(user),
            companyAccess: buildUserCompanyAccess(user),
            loading: false,
          });
        });
      } catch (caught) {
        const err = caught instanceof Error ? caught : new Error(String(caught));
        if (allowRetryAfterPurge && (await clearLocalAuthIfRefreshTokenDead(err))) {
          await loadAccess(false);
          return;
        }
        if (!cancelled) {
          writeBrowserSessionCookie(null);
          setState({
            user: null,
            role: null,
            permissions: [],
            companyAccess: buildUserCompanyAccess(null),
            loading: false,
          });
        }
      }
    }

    void loadAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAccess();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    hasPermission(permission: AppPermission) {
      return state.permissions.includes(permission);
    },
  };
}
