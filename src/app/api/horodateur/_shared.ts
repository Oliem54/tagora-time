import { NextResponse } from "next/server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  getAuthenticatedRequestUser,
  getCookieToken,
  resolveDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import {
  HORODATEUR_CANONICAL_EVENT_TYPES,
  HORODATEUR_PHASE1_EVENT_TYPES,
  HORODATEUR_PHASE1_EXCEPTION_TYPES,
  HorodateurPhase1Error,
  type HorodateurCanonicalEventType,
  type HorodateurPhase1EventType,
  type HorodateurPhase1ExceptionType,
} from "@/app/lib/horodateur-v1/types";
import type { NextRequest } from "next/server";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";

export function buildHorodateurErrorResponse(
  error: unknown,
  options?: { route?: string; status?: number }
) {
  const isDev = process.env.NODE_ENV !== "production";

  if (error instanceof HorodateurPhase1Error) {
    console.error("[horodateur] phase1 error", {
      message: error.message,
      code: error.code,
      details: null,
      hint: null,
      status: error.status,
      stack: error.stack ?? null,
    });

    return NextResponse.json(
      {
        success: false,
        ok: false,
        error: error.message,
        code: error.code,
        details: null,
        hint: null,
        ...(options?.route ? { route: options.route } : {}),
        ...(isDev && error.stack ? { stack: error.stack } : {}),
      },
      { status: options?.status ?? error.status }
    );
  }

  const errorLike =
    error && typeof error === "object"
      ? (error as {
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
        })
      : null;

  const message =
    error instanceof Error
      ? error.message
      : typeof errorLike?.message === "string" && errorLike.message.trim()
        ? errorLike.message
        : "Erreur serveur horodateur.";

  const code =
    typeof errorLike?.code === "string" && errorLike.code.trim()
      ? errorLike.code
      : null;
  const details =
    typeof errorLike?.details === "string" && errorLike.details.trim()
      ? errorLike.details
      : null;
  const hint =
    typeof errorLike?.hint === "string" && errorLike.hint.trim()
      ? errorLike.hint
      : null;

  console.error("[horodateur] unexpected error", {
    message,
    code,
    details,
    hint,
    stack: error instanceof Error ? error.stack ?? null : null,
    raw: error,
  });

  return NextResponse.json(
    {
      success: false,
      ok: false,
      error: message,
      code,
      details,
      hint,
      ...(options?.route ? { route: options.route } : {}),
      ...(isDev && error instanceof Error && error.stack
        ? { stack: error.stack }
        : {}),
    },
    { status: options?.status ?? 500 }
  );
}

export function buildHorodateurValidationErrorResponse(input: {
  error: string;
  code: string;
  status?: number;
  details?: string | null;
  hint?: string | null;
  route?: string;
}) {
  return NextResponse.json(
    {
      success: false,
      ok: false,
      error: input.error,
      code: input.code,
      details: input.details ?? null,
      hint: input.hint ?? null,
      ...(input.route ? { route: input.route } : {}),
    },
    { status: input.status ?? 400 }
  );
}

export function isHorodateurEventType(
  value: unknown
): value is HorodateurPhase1EventType | HorodateurCanonicalEventType {
  if (typeof value !== "string") {
    return false;
  }

  return (
    HORODATEUR_PHASE1_EVENT_TYPES.includes(value as HorodateurPhase1EventType) ||
    HORODATEUR_CANONICAL_EVENT_TYPES.includes(value as HorodateurCanonicalEventType)
  );
}

export function isHorodateurPhase1EventType(
  value: unknown
): value is HorodateurPhase1EventType | HorodateurCanonicalEventType {
  return isHorodateurEventType(value);
}

export function parseOptionalIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: true as const,
      value: undefined,
    };
  }

  const candidate = value.trim();
  const parsedTime = Date.parse(candidate);

  if (!Number.isFinite(parsedTime)) {
    return {
      ok: false as const,
      error: "Date/heure invalide.",
      code: "invalid_occurred_at",
    };
  }

  return {
    ok: true as const,
    value: candidate,
  };
}

export function parseOptionalWorkDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: true as const,
      value: undefined,
    };
  }

  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return {
      ok: false as const,
      error: "Parametre workDate invalide (YYYY-MM-DD attendu).",
      code: "invalid_work_date",
    };
  }

  const parsed = Date.parse(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false as const,
      error: "Parametre workDate invalide.",
      code: "invalid_work_date",
    };
  }

  return {
    ok: true as const,
    value: candidate,
  };
}

export function normalizeDirectionCompanyContext(value: unknown) {
  return value === "oliem_solutions" || value === "titan_produits_industriels"
    ? value
    : null;
}

export function normalizeNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeEventForApi(
  event:
    | {
        id: string;
        employee_id: number;
        event_type: string;
        occurred_at?: string | null;
        event_time?: string | null;
        created_at?: string;
        status: string;
        notes?: string | null;
        note?: string | null;
        work_date: string | null;
        week_start_date: string | null;
      }
    | null
) {
  if (!event) {
    return null;
  }

  const occurredAt = event.occurred_at ?? event.event_time ?? event.created_at ?? null;
  const notes = event.notes ?? event.note ?? null;

  return {
    id: event.id,
    employee_id: event.employee_id,
    event_type: event.event_type,
    occurredAt,
    occurred_at: occurredAt,
    event_time: occurredAt,
    status: event.status,
    notes,
    note: notes,
    work_date: event.work_date,
    week_start_date: event.week_start_date,
    created_at: event.created_at,
  };
}

export function parseOptionalApprovedMinutes(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;

  if (parsed == null) {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      ok: false as const,
      error: "approvedMinutes invalide (nombre >= 0 attendu).",
      code: "invalid_approved_minutes",
    };
  }

  return {
    ok: true as const,
    value: parsed,
  };
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
      response: buildHorodateurValidationErrorResponse({
        error: "Acces refuse.",
        code: "forbidden",
        status: 403,
      }),
    };
  }

  if (!hasUserPermission(user, "terrain")) {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: "Permission terrain requise.",
        code: "permission_denied",
        status: 403,
      }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function requireDirectionHorodateurAccess(req: NextRequest) {
  const authenticated = await getAuthenticatedRequestUser(req);
  const directionResolution = await resolveDirectionRequestUser(req);
  const user = authenticated.user ?? directionResolution.user;
  const role = authenticated.role;
  const authSource = authenticated.authSource ?? directionResolution.debug.authSource;
  const hasDirectionAccess = role === "direction" || role === "admin";
  const hasTerrainPermission = hasUserPermission(authenticated.user, "terrain");
  const isDev = process.env.NODE_ENV !== "production";
  const cookieValue = getCookieToken(req);

  const debug = {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    authSource,
    directionCheck: hasDirectionAccess,
    reason: !authenticated.user
      ? directionResolution.debug.apiBlockReason ?? "authenticated_user_missing"
      : !hasDirectionAccess
        ? directionResolution.debug.apiBlockReason ?? "direction_role_missing"
        : !hasTerrainPermission
          ? "terrain_permission_missing"
          : null,
    auth: {
      role,
      permissionTerrain: hasTerrainPermission,
      tokenUserId: authenticated.user?.id ?? null,
      tokenEmail: authenticated.user?.email ?? null,
      cookieRead: {
        cookieName: APP_SESSION_COOKIE_NAME,
        valuePresent: Boolean(cookieValue),
        valueLength: cookieValue?.length ?? 0,
      },
      strict: directionResolution.debug,
    },
  };

  if (!authenticated.user || !hasDirectionAccess) {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: "Acces refuse.",
        code: "forbidden",
        status: 403,
        ...(isDev ? { details: JSON.stringify(debug) } : {}),
      }),
    };
  }

  if (!hasTerrainPermission) {
    return {
      ok: false as const,
      response: buildHorodateurValidationErrorResponse({
        error: "Permission terrain requise.",
        code: "permission_denied",
        status: 403,
        ...(isDev ? { details: JSON.stringify(debug) } : {}),
      }),
    };
  }

  return {
    ok: true as const,
    user: authenticated.user,
    debug,
  };
}
