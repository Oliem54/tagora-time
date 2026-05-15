import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  getAuthenticatedRequestUser,
  getRequestAccessToken,
} from "@/app/lib/account-requests.server";
import { isJwtExplicitlyAal1Only } from "@/app/lib/auth/jwt-access-token";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import type { PayrollAuditActorRole } from "@/app/lib/horodateur-payroll/types";

export type HorodateurPayrollAccessRole = "direction" | "admin" | "employe" | null;

function mfaBlockedResponse() {
  return NextResponse.json(
    {
      error:
        "Vérification en deux étapes requise. Complétez le MFA puis réessayez.",
      code: "MFA_AAL2_REQUIRED",
    },
    { status: 403 }
  );
}

function forbiddenResponse(message: string, code?: string) {
  return NextResponse.json(
    {
      error: message,
      ...(code ? { code } : {}),
    },
    { status: 403 }
  );
}

function unauthorizedResponse() {
  return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
}

function checkMfa(req: NextRequest) {
  const token = getRequestAccessToken(req).token;
  return isJwtExplicitlyAal1Only(token);
}

export function mapAppRoleToPayrollActorRole(
  role: HorodateurPayrollAccessRole
): PayrollAuditActorRole {
  if (role === "direction" || role === "admin" || role === "employe") {
    return role;
  }
  return "system";
}

/**
 * Direction ou administrateur — horodateur opérationnel (punch, corrections, exceptions).
 * N'inclut pas automatiquement le droit de modifier les paramètres financiers.
 */
export async function requireHorodateurOperationalAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return { ok: false as const, response: unauthorizedResponse() };
  }

  if (role !== "direction" && role !== "admin") {
    return {
      ok: false as const,
      response: forbiddenResponse(
        "Acces reserve a la direction ou a l administrateur.",
        "HORODATEUR_OPERATIONAL_FORBIDDEN"
      ),
    };
  }

  if (!hasUserPermission(user, "terrain")) {
    return {
      ok: false as const,
      response: forbiddenResponse("Permission terrain requise.", "TERRAIN_PERMISSION_DENIED"),
    };
  }

  if (checkMfa(req)) {
    return { ok: false as const, response: mfaBlockedResponse() };
  }

  return {
    ok: true as const,
    user,
    role: role as "direction" | "admin",
    supabase: createAdminSupabaseClient(),
    actorRole: mapAppRoleToPayrollActorRole(role),
  };
}

/**
 * Administrateur seulement — paramètres financiers paie (taux, % vacances, soldes initiaux).
 */
export async function requireHorodateurFinancialAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return { ok: false as const, response: unauthorizedResponse() };
  }

  if (role !== "admin") {
    return {
      ok: false as const,
      response: forbiddenResponse(
        role === "direction"
          ? "Modification financiere reservee aux administrateurs. La direction peut consulter les montants en lecture seule."
          : "Acces reserve aux administrateurs.",
        "HORODATEUR_FINANCIAL_ADMIN_ONLY"
      ),
    };
  }

  if (checkMfa(req)) {
    return { ok: false as const, response: mfaBlockedResponse() };
  }

  return {
    ok: true as const,
    user,
    role: "admin" as const,
    supabase: createAdminSupabaseClient(),
    actorRole: "admin" as const,
  };
}

/**
 * Lecture des montants paie : employé (soi), direction ou admin.
 */
export async function requireHorodateurPayrollReadAccess(
  req: NextRequest,
  options?: { targetEmployeeId?: number }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return { ok: false as const, response: unauthorizedResponse() };
  }

  if (role === "admin" || role === "direction") {
    if (checkMfa(req)) {
      return { ok: false as const, response: mfaBlockedResponse() };
    }
    return {
      ok: true as const,
      user,
      role,
      supabase: createAdminSupabaseClient(),
      actorRole: mapAppRoleToPayrollActorRole(role),
      readOnly: true,
    };
  }

  if (role === "employe") {
    if (!options?.targetEmployeeId) {
      return {
        ok: false as const,
        response: forbiddenResponse("Identifiant employe requis.", "EMPLOYEE_ID_REQUIRED"),
      };
    }
    const supabase = createAdminSupabaseClient();
    const { data: chauffeur, error } = await supabase
      .from("chauffeurs")
      .select("id, auth_user_id")
      .eq("id", options.targetEmployeeId)
      .maybeSingle<{ id: number; auth_user_id: string | null }>();

    if (error) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: error.message }, { status: 400 }),
      };
    }
    if (!chauffeur || chauffeur.auth_user_id !== user.id) {
      return {
        ok: false as const,
        response: forbiddenResponse(
          "Acces refuse : vous ne pouvez consulter que votre propre dossier.",
          "EMPLOYEE_SELF_ONLY"
        ),
      };
    }
    return {
      ok: true as const,
      user,
      role: "employe" as const,
      supabase,
      actorRole: "employe" as const,
      readOnly: true,
    };
  }

  return {
    ok: false as const,
    response: forbiddenResponse("Role non autorise pour la lecture paie.", "ROLE_FORBIDDEN"),
  };
}

export function assertFinancialMutationByRole(role: HorodateurPayrollAccessRole): {
  ok: true;
} | {
  ok: false;
  message: string;
  code: string;
} {
  if (role !== "admin") {
    return {
      ok: false,
      message:
        "Modification financiere reservee aux administrateurs. Utilisez les routes /api/admin/horodateur-payroll/.",
      code: "HORODATEUR_FINANCIAL_ADMIN_ONLY",
    };
  }
  return { ok: true };
}

export type PayrollAccessUser = User;
