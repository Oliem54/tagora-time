import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildUpdateStamp } from "@/app/lib/livraisons/audit-stamp.server";

// Champs autorises a etre mis a jour via cette API generique.
// Note : les champs d'audit (created_by_*, scheduled_by_*) ne peuvent pas etre
// reecrits cote client. updated_by_* et updated_at sont stampes automatiquement.
const ALLOWED_UPDATE_FIELDS = new Set([
  "dossier_id",
  "client",
  "client_phone",
  "adresse",
  "ville",
  "code_postal",
  "province",
  "date_livraison",
  "heure_prevue",
  "chauffeur_id",
  "vehicule_id",
  "remorque_id",
  "statut",
  "company_context",
  "notes",
  "note_chauffeur",
  "commentaire_operationnel",
  "latitude",
  "longitude",
  "type_operation",
  "ordre_arret",
]);

type AnyRecord = Record<string, unknown>;

function sanitizePayload(input: AnyRecord) {
  const payload: AnyRecord = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) {
      ignored.push(key);
      continue;
    }
    // Conversion legere pour les champs numeriques connus
    if (
      (key === "dossier_id" ||
        key === "chauffeur_id" ||
        key === "vehicule_id" ||
        key === "remorque_id" ||
        key === "ordre_arret") &&
      value != null &&
      value !== ""
    ) {
      const parsed = Number(value);
      payload[key] = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
      continue;
    }
    if ((key === "latitude" || key === "longitude") && value != null && value !== "") {
      const parsed = Number(value);
      payload[key] = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    payload[key] = value === "" ? null : value;
  }
  return { payload, ignored };
}

/**
 * PATCH /api/livraisons/[id]
 * Met a jour une livraison existante.
 * Stamp automatiquement updated_by_user_id, updated_by_name et updated_at.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json(
        { error: { message: "Authentification requise." } },
        { status: 401 }
      );
    }

    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: { message: "Acces refuse." } }, { status: 403 });
    }

    if (role !== "direction" && role !== "admin") {
      return NextResponse.json(
        { error: { message: "Action reservee a la direction/admin." } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json(
        { error: { message: "Identifiant livraison invalide." } },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    const { payload, ignored } = sanitizePayload(body);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        {
          error: {
            message: "Aucun champ valide fourni.",
            ignored,
          },
        },
        { status: 400 }
      );
    }

    const stampedPayload = { ...payload, ...buildUpdateStamp(user) };

    const supabase = createAdminSupabaseClient();
    const updateRes = await supabase
      .from("livraisons_planifiees")
      .update(stampedPayload)
      .eq("id", livraisonId)
      .select("*")
      .maybeSingle();

    if (updateRes.error) {
      return NextResponse.json(
        {
          error: {
            message: updateRes.error.message,
            code: updateRes.error.code,
            details: updateRes.error.details,
            hint: updateRes.error.hint,
          },
        },
        { status: 400 }
      );
    }

    if (!updateRes.data) {
      return NextResponse.json(
        {
          error: {
            message: "Aucune ligne mise a jour. Verifier l'identifiant ou les regles RLS.",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_row: updateRes.data,
      ignored: ignored.length > 0 ? ignored : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors de la mise a jour.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

/**
 * DELETE /api/livraisons/[id]
 * Supprime une livraison. Reserve aux administrateurs.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json(
        { error: { message: "Authentification requise." } },
        { status: 401 }
      );
    }

    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: { message: "Acces refuse." } }, { status: 403 });
    }

    if (role !== "direction" && role !== "admin") {
      return NextResponse.json(
        { error: { message: "Suppression reservee a la direction/admin." } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json(
        { error: { message: "Identifiant livraison invalide." } },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const deleteRes = await supabase
      .from("livraisons_planifiees")
      .delete()
      .eq("id", livraisonId)
      .select("id")
      .maybeSingle();

    if (deleteRes.error) {
      return NextResponse.json(
        {
          error: {
            message: deleteRes.error.message,
            code: deleteRes.error.code,
            details: deleteRes.error.details,
            hint: deleteRes.error.hint,
          },
        },
        { status: 400 }
      );
    }

    if (!deleteRes.data) {
      return NextResponse.json(
        {
          error: {
            message: "Aucune ligne supprimee. Verifier l'identifiant ou les regles RLS.",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, deleted_id: deleteRes.data.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors de la suppression.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
