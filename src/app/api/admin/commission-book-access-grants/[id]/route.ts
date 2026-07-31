import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadChauffeurLabels,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import {
  assertUserHasActiveOrganizationMembership,
  normalizeOrganizationUuid,
  rejectsGrantIdentityRetarget,
} from "@/app/lib/auth/organization-access.server";
import { mapCommissionBookAccessGrantRecord } from "@/app/lib/commissions/sales-book-grants.server";
import {
  isCommissionBookGrantId,
  isRevokeRequestedInBody,
  normalizeCommissionTimestamp,
} from "@/app/lib/commissions/sales-book-grants.shared";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveOwnerOrganizationId(
  supabase: SupabaseClient,
  ownerChauffeurId: number
) {
  const ownerRes = await supabase
    .from("chauffeurs")
    .select("id, organization_id")
    .eq("id", ownerChauffeurId)
    .maybeSingle();
  if (ownerRes.error || !ownerRes.data) {
    return { ok: false as const, status: 404 as const, error: "Employe proprietaire introuvable." };
  }
  const organizationId = normalizeOrganizationUuid(
    (ownerRes.data as { organization_id?: unknown }).organization_id
  );
  if (!organizationId) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Employe sans organization_id UUID — ecriture refusee.",
    };
  }
  return { ok: true as const, organizationId };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id: rawId } = await params;
    const id = rawId.trim();

    if (!isCommissionBookGrantId(id)) {
      return NextResponse.json({ error: "Identifiant de grant invalide." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (rejectsGrantIdentityRetarget(body)) {
      return NextResponse.json(
        {
          error:
            "Modification de owner_chauffeur_id ou viewer_user_id interdite. Creez un nouveau grant.",
        },
        { status: 400 }
      );
    }

    const revokeRequested = isRevokeRequestedInBody(body);

    const existingRes = await supabase
      .from("commission_book_access_grants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingRes.error || !existingRes.data) {
      return NextResponse.json({ error: "Grant introuvable." }, { status: 404 });
    }

    const existingRow = existingRes.data as Record<string, unknown>;
    const existingRevokedAt = normalizeCommissionTimestamp(existingRow.revoked_at);
    const ownerChauffeurId = Math.trunc(Number(existingRow.owner_chauffeur_id));
    const viewerUserId =
      typeof existingRow.viewer_user_id === "string"
        ? existingRow.viewer_user_id.trim()
        : "";

    if (revokeRequested) {
      if (existingRevokedAt) {
        const ownerId = Math.trunc(Number(existingRow.owner_chauffeur_id));
        const labelMap = await loadChauffeurLabels(
          supabase,
          Number.isFinite(ownerId) && ownerId > 0 ? [ownerId] : []
        );
        return NextResponse.json({
          grant: mapCommissionBookAccessGrantRecord(
            existingRow,
            labelMap.get(ownerId) ?? null
          ),
        });
      }

      const revokedAtIso = new Date().toISOString();
      const updateRes = await supabase
        .from("commission_book_access_grants")
        .update({ revoked_at: revokedAtIso })
        .eq("id", id)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();

      if (updateRes.error) {
        return NextResponse.json({ error: updateRes.error.message }, { status: 400 });
      }

      if (!updateRes.data) {
        return NextResponse.json(
          { error: "Révocation non confirmée en base." },
          { status: 409 }
        );
      }

      const verifyRes = await supabase
        .from("commission_book_access_grants")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (verifyRes.error || !verifyRes.data) {
        return NextResponse.json(
          { error: "Grant introuvable après révocation." },
          { status: 404 }
        );
      }

      const verifiedRow = verifyRes.data as Record<string, unknown>;
      const verifiedRevokedAt = normalizeCommissionTimestamp(verifiedRow.revoked_at);
      if (!verifiedRevokedAt) {
        return NextResponse.json(
          { error: "Révocation non confirmée en base." },
          { status: 409 }
        );
      }

      const ownerId = Math.trunc(Number(verifiedRow.owner_chauffeur_id));
      const labelMap = await loadChauffeurLabels(
        supabase,
        Number.isFinite(ownerId) && ownerId > 0 ? [ownerId] : []
      );

      return NextResponse.json({
        grant: mapCommissionBookAccessGrantRecord(
          verifiedRow,
          labelMap.get(ownerId) ?? null
        ),
      });
    }

    const patch: Record<string, unknown> = {};

    if (body.revoked_at !== undefined) {
      patch.revoked_at =
        body.revoked_at === null ? null : asText(String(body.revoked_at));
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

    // Non-revoke updates (notes/expires/reactivate): viewer must still share owner org.
    if (
      !Number.isFinite(ownerChauffeurId) ||
      ownerChauffeurId <= 0 ||
      !viewerUserId
    ) {
      return NextResponse.json({ error: "Grant invalide." }, { status: 400 });
    }
    const ownerOrg = await resolveOwnerOrganizationId(supabase, ownerChauffeurId);
    if (!ownerOrg.ok) {
      return NextResponse.json({ error: ownerOrg.error }, { status: ownerOrg.status });
    }
    const viewerMembership = await assertUserHasActiveOrganizationMembership(
      viewerUserId,
      ownerOrg.organizationId
    );
    if (!viewerMembership.ok) {
      return NextResponse.json(
        { error: viewerMembership.error },
        { status: viewerMembership.status }
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
    const ownerId = Math.trunc(Number(updatedRow.owner_chauffeur_id));
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
