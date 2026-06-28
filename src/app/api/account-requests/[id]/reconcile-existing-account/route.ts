import { NextRequest, NextResponse } from "next/server";
import {
  getAccountRequestsRequestDebug,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import {
  AccountReconcileError,
  reconcileExistingAccountRequest,
} from "@/app/lib/account-reconcile.server";

export const dynamic = "force-dynamic";

function parseEmployeeId(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requestDebug = getAccountRequestsRequestDebug(req);

    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error:
            "Appel refusé: cette route n'accepte que les appels marqués depuis le navigateur authentifié.",
        },
        { status: 400 }
      );
    }

    const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
    if (mfaError) {
      return mfaError;
    }

    if (!user || role !== "admin") {
      return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const employeeId = parseEmployeeId(body.employeeId ?? body.employee_id);

    const result = await reconcileExistingAccountRequest({
      requestId: id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
      employeeId,
    });

    return NextResponse.json({
      success: true,
      status: result.request.status,
      requestId: result.request.id,
      employeeId: result.employeeId,
      authUserId: result.authUserId,
      assignedRole: result.assignedRole,
      assignedPermissions: result.assignedPermissions,
      previousStatus: result.previousStatus,
    });
  } catch (error) {
    if (error instanceof AccountReconcileError) {
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
            : "Erreur lors de la réconciliation du compte existant.",
      },
      { status: 500 }
    );
  }
}
