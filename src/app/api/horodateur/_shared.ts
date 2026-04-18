import { NextResponse } from "next/server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { getAuthenticatedRequestUser, getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { HORODATEUR_PHASE1_EVENT_TYPES, HORODATEUR_PHASE1_EXCEPTION_TYPES, HorodateurPhase1Error, type HorodateurPhase1EventType, type HorodateurPhase1ExceptionType } from "@/app/lib/horodateur-v1/types";
import type { NextRequest } from "next/server";

export function buildHorodateurErrorResponse(error: unknown) {
  if (error instanceof HorodateurPhase1Error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Erreur serveur horodateur.",
    },
    { status: 500 }
  );
}

export function isHorodateurPhase1EventType(value: unknown): value is HorodateurPhase1EventType {
  return HORODATEUR_PHASE1_EVENT_TYPES.includes(
    value as HorodateurPhase1EventType
  );
}

export function isHorodateurPhase1ExceptionType(
  value: unknown
): value is HorodateurPhase1ExceptionType {
  return HORODATEUR_PHASE1_EXCEPTION_TYPES.includes(
    value as HorodateurPhase1ExceptionType
  );
}

export async function requireEmployeeHorodateurAccess(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user || role !== "employe") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces refuse." }, { status: 403 }),
    };
  }

  if (!hasUserPermission(user, "terrain")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Permission terrain requise." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function requireDirectionHorodateurAccess(req: NextRequest) {
  const { user, role } = await getStrictDirectionRequestUser(req);

  if (!user || role !== "direction") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces refuse." }, { status: 403 }),
    };
  }

  if (!hasUserPermission(user, "terrain")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Permission terrain requise." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    user,
  };
}
