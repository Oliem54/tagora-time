import { supabase } from "@/app/lib/supabase/client";
import { uploadOperationProofViaServer } from "@/app/lib/storage/photos-dossiers-upload.client";

export type OperationProofModuleSource = "livraison" | "ramassage";

type UploadFileParams = {
  moduleSource: OperationProofModuleSource;
  sourceId: number;
  typePreuve: "voice" | "signature" | "document";
  file: File;
  categorie: string;
  commentaire?: string | null;
};

type UploadParams = UploadFileParams;

export async function uploadOperationProofFile(
  params: UploadParams
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await uploadOperationProofViaServer({
    moduleSource: params.moduleSource,
    sourceId: params.sourceId,
    typePreuve: params.typePreuve,
    file: params.file,
    categorie: params.categorie,
    commentaire: params.commentaire ?? null,
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return { ok: true };
}

export async function uploadOperationProofPhoto(params: {
  moduleSource: OperationProofModuleSource;
  sourceId: number;
  file: File;
  clientLabel: string;
  commentaire?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  return uploadOperationProofFile({
    moduleSource: params.moduleSource,
    sourceId: params.sourceId,
    typePreuve: "document",
    file: params.file,
    categorie: "photo",
    commentaire: params.commentaire ?? `Photo terrain — ${params.clientLabel}`,
  });
}

export async function saveOperationProofNote(params: {
  moduleSource: OperationProofModuleSource;
  sourceId: number;
  note: string;
  categorie?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = params.note.trim();
  if (!trimmed) {
    return { ok: false, message: "Ecrivez une note avant d enregistrer." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Session invalide. Reconnecte-toi." };
  }

  const categorie =
    params.categorie ??
    (params.moduleSource === "ramassage" ? "preuve_ramassage" : "preuve_livraison");

  const { error: insertError } = await supabase.from("operation_proofs").insert({
    module_source: params.moduleSource,
    source_id: String(params.sourceId),
    type_preuve: "note",
    categorie,
    nom: `note-${Date.now()}`,
    date_heure: new Date().toISOString(),
    cree_par: user.id,
    url_fichier: "",
    mime_type: "text/plain",
    taille: trimmed.length,
    commentaire: trimmed,
    statut: "captured",
  });

  if (insertError) {
    return { ok: false, message: "Impossible d enregistrer la note." };
  }

  return { ok: true };
}
