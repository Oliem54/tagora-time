import { NextRequest, NextResponse } from "next/server";
import {
  loadChauffeurLabels,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { mapCommissionBookAccessGrantRecord } from "@/app/lib/commissions/sales-book-grants.server";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRevokeRequested(body: Record<string, unknown>) {
  return body.revoke === true || body.revoke === "true";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const existingRes = await supabase
      .from("commission_book_access_grants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingRes.error || !existingRes.data) {
      return NextResponse.json({ error: "Grant introuvable." }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    const revokeRequested = isRevokeRequested(body);

    if (revokeRequested) {
      patch.revoked_at = new Date().toISOString();
    } else if (body.revoked_at !== undefined) {
      patch.revoked_at = body.revoked_at === null ? null : asText(String(body.revoked_at));
    }

    if (body.notes !== undefined) {
      patch.notes = body.notes === null ? null : asText(String(body.notes));
    }

    if (body.expires_at !== undefined) {
      patch.expires_at = body.expires_at === null ? null : asText(String(body.expires_at));
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Aucune modification demandee." }, { status: 400 });
    }

    if ("can_edit" in body || body.can_view === false) {
      return NextResponse.json(
        { error: "Modification de can_view/can_edit non autorisee en V1." },
        { status: 400 }
      );
    }

    const updateRes = await supabase
      .from("commission_book_access_grants")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateRes.error || !updateRes.data) {
      return NextResponse.json(
        { error: updateRes.error?.message ?? "Mise a jour du grant impossible." },
        { status: updateRes.error ? 400 : 404 }
      );
    }

    const updatedRow = updateRes.data as Record<string, unknown>;
    if (revokeRequested) {
      const revokedAt = updatedRow.revoked_at;
      if (typeof revokedAt !== "string" || revokedAt.trim().length === 0) {
        return NextResponse.json(
          { error: "Révocation non confirmée en base." },
          { status: 409 }
        );
      }
    }

    const ownerId = Math.trunc(
      Number(updatedRow.owner_chauffeur_id)
    );
    const labelMap = await loadChauffeurLabels(
      supabase,
      Number.isFinite(ownerId) && ownerId > 0 ? [ownerId] : []
    );

    return NextResponse.json({
      grant: mapCommissionBookAccessGrantRecord(updatedRow, labelMap.get(ownerId) ?? null),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur mise a jour grant." },
      { status: 500 }
    );
  }
}
