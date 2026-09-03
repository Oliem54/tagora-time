"use client";

import { useCallback, useEffect, useState } from "react";
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
  hasUserPermission,
} from "@/app/lib/auth/permissions";
import {
  buildAppSessionCookieWriteDebug,
  writeBrowserSessionCookie,
} from "@/app/lib/auth/session-cookie";
import { getJwtAal, getJwtAppRole } from "@/app/lib/auth/jwt-access-token";
import { shouldClearAppModuleCookieForSession } from "@/app/lib/auth/mfa-fresh-session.shared";
import { fetchSessionAuthorizationContext } from "@/app/lib/auth/session-context.client";
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
  organizationId: string | null;
  loading: boolean;
};

let lastSyncActivationAt = 0;
const SYNC_ACTIVATION_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function useCurrentAccess() {
  const [state, setState] = useState<AccessState>({
    user: null,
    role: null,
    permissions: [],
    companyAccess: buildUserCompanyAccess(null),
    organizationId: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function syncAccountActivation(retryDepth = 0) {
      try {
        const now = Date.now();
        if (now - lastSyncActivationAt < SYNC_ACTIVATION_MIN_INTERVAL_MS) {
          return;
        }
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
        const jwtAal = getJwtAal(token ?? null);
        const jwtRole = getJwtAppRole(token ?? null);
        const clearModuleCookie = shouldClearAppModuleCookieForSession({
          hasToken: Boolean(token),
          jwtAal,
          role: jwtRole,
        });

        if (clearModuleCookie) {
          writeBrowserSessionCookie(null);
        }
        devInfo(
          "auth-cookie",
          "refresh cookie gated to AAL2 for MFA roles",
          buildAppSessionCookieWriteDebug(
            token && jwtAal === "aal2" ? token : null,
            window.location.protocol === "https:"
          )
        );

        if (!token) {
          return;
        }

        try {
          const ac = new AbortController();
          const syncTimeout = setTimeout(() => ac.abort(), 18_000);
          let response: Response;
          try {
            response = await fetch("/api/account-requests/sync-activation", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              signal: ac.signal,
            });
          } finally {
            clearTimeout(syncTimeout);
          }
          const payload = await response.json().catch(() => null);
          devInfo("auth-cookie", "refresh sync-activation response", payload);
          if (response.ok) {
            lastSyncActivationAt = Date.now();
          }
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
          const brokered = await fetchSessionAuthorizationContext();
          if (
            brokered.authorized &&
            brokered.source === "nexus_handoff" &&
            brokered.userId &&
            brokered.appRole
          ) {
            if (cancelled) return;
            setState({
              user: {
                id: brokered.userId,
                aud: "authenticated",
                app_metadata: {},
                user_metadata: {},
                created_at: new Date(0).toISOString(),
              } as User,
              role: brokered.appRole,
              permissions: [],
              companyAccess: buildUserCompanyAccess(null),
              organizationId: brokered.organizationId,
              loading: false,
            });
            return;
          }

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

          let role: AppRole | null = null;
          let organizationId: string | null = null;

          if (user) {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              const ctx = await fetchSessionAuthorizationContext(token);
              if (ctx.authorized && ctx.appRole) {
                // H4 membership is the effective role source for permissions.
                role = ctx.appRole;
                organizationId = ctx.organizationId;
              } else {
                // Non-member / inactive / unauthorized: no organizational elevation.
                role = null;
                organizationId = null;
              }
            } else {
              role = getUserRole(user);
            }
          }

          setState({
            user,
            role,
            permissions: getUserPermissions(user),
            companyAccess: buildUserCompanyAccess(user),
            organizationId,
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
            organizationId: null,
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

  const hasPermission = useCallback(
    (permission: AppPermission) =>
      hasUserPermission(state.user, permission, state.role),
    [state.user, state.role]
  );

  return {
    ...state,
    hasPermission,
  };
}
