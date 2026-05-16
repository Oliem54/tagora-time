import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { getUserRole } from "@/app/lib/auth/roles";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import {
  canDeleteOperationDocument,
  extractStoragePathFromProofUrl,
} from "@/app/lib/operation-proof-documents.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const PHOTOS_BUCKET = "photos-dossiers";

type ProofRow = {
  id: string;
  module_source: string;
  source_id: string;
  type_preuve: string;
  categorie: string | null;
  cree_par: string | null;
  url_fichier: string;
  nom: string;
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role: _role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const role = getUserRole(user);
    const canAccess =
      hasUserPermission(user, "documents")
      || hasUserPermission(user, "livraisons")
      || hasUserPermission(user, "terrain");

    if (!canAccess) {
      return NextResponse.json({ error: "Permission insuffisante." }, { status: 403 });
    }

    const { id } = await params;
    const proofId = String(id || "").trim();
    if (!proofId) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("operation_proofs")
      .select("id, module_source, source_id, type_preuve, categorie, cree_par, url_fichier, nom")
      .eq("id", proofId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    }

    const proof = data as ProofRow;
    if (proof.type_preuve !== "document") {
      return NextResponse.json(
        { error: "Seuls les documents fichiers peuvent être supprimés depuis cette action." },
        { status: 400 }
      );
    }

    if (
      proof.module_source !== "livraison"
      && proof.module_source !== "ramassage"
    ) {
      return NextResponse.json({ error: "Opération non autorisée pour ce module." }, { status: 403 });
    }

    if (
      !canDeleteOperationDocument({
        role,
        userId: user.id,
        creePar: proof.cree_par,
        categorie: proof.categorie,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "Suppression non autorisée. Les bons et factures sont réservés à la direction.",
        },
        { status: 403 }
      );
    }

    const storagePath = proof.url_fichier
      ? extractStoragePathFromProofUrl(proof.url_fichier, PHOTOS_BUCKET)
      : null;

    const { error: deleteError } = await supabase
      .from("operation_proofs")
      .delete()
      .eq("id", proofId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .remove([storagePath]);
      if (storageError) {
        console.warn("[operation-proofs] storage remove failed", storageError.message);
      }
    }

    return NextResponse.json({ success: true, id: proofId, name: proof.nom });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
