"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { AppRole, getUserRole } from "@/app/lib/auth/roles";
import {
  AppPermission,
  getUserPermissions,
} from "@/app/lib/auth/permissions";

type AccessState = {
  user: User | null;
  role: AppRole | null;
  permissions: AppPermission[];
  loading: boolean;
};

export function useCurrentAccess() {
  const [state, setState] = useState<AccessState>({
    user: null,
    role: null,
    permissions: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (cancelled) return;

      setState({
        user,
        role: getUserRole(user),
        permissions: getUserPermissions(user),
        loading: false,
      });
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
