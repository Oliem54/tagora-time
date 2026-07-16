import { NextRequest, NextResponse } from "next/server";
import { getUserRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildOrganizationStoragePath,
  PHOTOS_DOSSIERS_BUCKET,
  toStorageReferenceUrl,
  validatePhotosDossiersFile,
} from "@/app/lib/storage/photos-dossiers-contract.shared";
import {
  assertModuleSourceAccessible,
  resolveStorageOrganizationContext,
  storageOrgFailureMessage,
} from "@/app/lib/storage/photos-dossiers-org.server";

export const runtime = "nodejs";

const ALLOWED_TYPE_PREUVE = new Set(["document", "voice", "signature"]);

function genericStorageError(status: number) {
  return NextResponse.json(
    { error: status === 401 ? "Authentification requise." : "Opération Storage refusée." },
    { status }
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const clientOrganizationId = form.get("organization_id") ?? form.get("organizationId");
    if (clientOrganizationId != null && String(clientOrganizationId).trim()) {
      return NextResponse.json(
        { error: "Organisation client non autorisée." },
        { status: 403 }
      );
    }
    if (form.get("storage_path") != null || form.get("path") != null) {
      return NextResponse.json({ error: "Chemin client non autorisé." }, { status: 403 });
    }

    const org = await resolveStorageOrganizationContext(req);
    if (!org.ok) {
      return NextResponse.json(
        { error: storageOrgFailureMessage(org.reason) },
        { status: org.status }
      );
    }

    const moduleSource = String(form.get("module_source") ?? form.get("moduleSource") ?? "").trim();
    const sourceId = String(form.get("source_id") ?? form.get("sourceId") ?? form.get("record_id") ?? "").trim();
    const typePreuve = String(form.get("type_preuve") ?? form.get("typePreuve") ?? "document").trim();
    const categorie = String(form.get("categorie") ?? "").trim() || null;
    const commentaireRaw = form.get("commentaire");
    const commentaire =
      commentaireRaw == null ? null : String(commentaireRaw).trim() || null;
    const fileEntry = form.get("file");

    if (!ALLOWED_TYPE_PREUVE.has(typePreuve)) {
      return NextResponse.json({ error: "Type de preuve invalide." }, { status: 400 });
    }

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    }

    const fileCheck = validatePhotosDossiersFile({
      filename: fileEntry.name || `preuve.${typePreuve === "voice" ? "webm" : "bin"}`,
      mimeType: fileEntry.type,
      size: fileEntry.size,
    });
    if (!fileCheck.ok) {
      return NextResponse.json({ error: fileCheck.reason }, { status: 400 });
    }

    const access = await assertModuleSourceAccessible({
      user: org.user,
      moduleSource,
      sourceId,
    });
    if (!access.ok) {
      return genericStorageError(access.status >= 400 ? access.status : 403);
    }

    const pathBuilt = buildOrganizationStoragePath({
      organizationId: org.organizationId,
      domain: access.domain,
      recordId: sourceId,
      originalFilename: fileCheck.filename,
      typePreuve,
    });
    if (!pathBuilt.ok) {
      return NextResponse.json({ error: pathBuilt.reason }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const bytes = await fileEntry.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(PHOTOS_DOSSIERS_BUCKET)
      .upload(pathBuilt.path, bytes, {
        contentType: fileEntry.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      console.warn("[operation-proofs/upload] storage upload failed");
      return NextResponse.json({ error: "Échec envoi du fichier." }, { status: 400 });
    }

    const storageRef = toStorageReferenceUrl(pathBuilt.path);
    const { data: inserted, error: insertError } = await admin
      .from("operation_proofs")
      .insert({
        module_source: moduleSource,
        source_id: sourceId,
        type_preuve: typePreuve,
        categorie,
        nom: fileCheck.filename,
        date_heure: new Date().toISOString(),
        cree_par: org.userId,
        url_fichier: storageRef,
        mime_type: fileEntry.type || null,
        taille: Number.isFinite(fileEntry.size) ? fileEntry.size : null,
        commentaire,
        statut: "captured",
      })
      .select("id, module_source, source_id, type_preuve, categorie, nom, mime_type, taille")
      .maybeSingle();

    if (insertError || !inserted) {
      // Best-effort cleanup; do not expose path.
      await admin.storage.from(PHOTOS_DOSSIERS_BUCKET).remove([pathBuilt.path]);
      console.warn("[operation-proofs/upload] proof insert failed");
      return NextResponse.json(
        { error: "Fichier envoyé mais enregistrement impossible." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      proof: inserted,
      // Logical reference only — never a permanent public URL.
      storageRef,
      role: getUserRole(org.user),
      membershipRole: org.membershipRole,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("authent")) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    console.warn("[operation-proofs/upload] unexpected failure");
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
