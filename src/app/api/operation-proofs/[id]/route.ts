import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { getUserRole } from "@/app/lib/auth/roles";
import { canDeleteOperationDocument } from "@/app/lib/operation-proof-documents.shared";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { PHOTOS_DOSSIERS_BUCKET } from "@/app/lib/storage/photos-dossiers-contract.shared";
import {
  assertModuleSourceAccessible,
  assertObjectPathReadableByOrganization,
  resolveStorageOrganizationContext,
  storageOrgFailureMessage,
} from "@/app/lib/storage/photos-dossiers-org.server";

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
    const { user } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const org = await resolveStorageOrganizationContext(req);
    if (!org.ok) {
      return NextResponse.json(
        { error: storageOrgFailureMessage(org.reason) },
        { status: org.status }
      );
    }

    const role = getUserRole(user);
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
      return NextResponse.json({ error: "Lecture impossible." }, { status: 400 });
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

    if (proof.module_source !== "livraison" && proof.module_source !== "ramassage") {
      return NextResponse.json({ error: "Opération non autorisée pour ce module." }, { status: 403 });
    }

    const access = await assertModuleSourceAccessible({
      user: org.user,
      moduleSource: proof.module_source,
      sourceId: proof.source_id,
    });
    if (!access.ok) {
      return NextResponse.json({ error: "Permission insuffisante." }, { status: 403 });
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

    let storagePath: string | null = null;
    if (proof.url_fichier) {
      const pathCheck = assertObjectPathReadableByOrganization({
        urlOrPath: proof.url_fichier,
        organizationId: org.organizationId,
      });
      if (!pathCheck.ok) {
        return NextResponse.json({ error: "Opération Storage refusée." }, { status: 403 });
      }
      storagePath = pathCheck.path;
    }

    const { error: deleteError } = await supabase
      .from("operation_proofs")
      .delete()
      .eq("id", proofId);

    if (deleteError) {
      return NextResponse.json({ error: "Suppression impossible." }, { status: 400 });
    }

    if (storagePath) {
      // Targeted single-object remove only — never prefix/folder delete.
      const { error: storageError } = await supabase.storage
        .from(PHOTOS_DOSSIERS_BUCKET)
        .remove([storagePath]);
      if (storageError) {
        console.warn("[operation-proofs] storage remove failed");
      }
    }

    return NextResponse.json({ success: true, id: proofId, name: proof.nom });
  } catch {
    console.warn("[operation-proofs] delete unexpected failure");
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
