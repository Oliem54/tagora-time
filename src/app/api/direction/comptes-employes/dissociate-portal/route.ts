import { NextRequest, NextResponse } from "next/server";
import {
  getAccountRequestsRequestDebug,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import { dissociateEmployeePortal } from "@/app/lib/employee-portal-dissociate.server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestDebug = getAccountRequestsRequestDebug(req);

  try {
    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error: "Appel refusé : requête non marquée comme navigateur authentifié.",
        },
        { status: 400 }
      );
    }

    const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
    if (mfaError) {
      return mfaError;
    }

    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      chauffeurId?: unknown;
      authUserId?: unknown;
    };

    const chauffeurId =
      typeof body.chauffeurId === "number"
        ? body.chauffeurId
        : typeof body.chauffeurId === "string"
          ? Number.parseInt(body.chauffeurId, 10)
          : null;
    const authUserId = typeof body.authUserId === "string" ? body.authUserId.trim() : null;

    const result = await dissociateEmployeePortal({
      chauffeurId: Number.isFinite(chauffeurId) ? chauffeurId : null,
      authUserId,
      actorUserId: user.id,
      actorAppRole: role === "admin" ? "admin" : "direction",
      actorName: user.email ?? user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      employeeName: result.employeeName,
      email: result.email,
      chauffeurId: result.chauffeurId,
      authUserId: result.authUserId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de la dissociation du portail.",
      },
      { status: 500 }
    );
  }
}
