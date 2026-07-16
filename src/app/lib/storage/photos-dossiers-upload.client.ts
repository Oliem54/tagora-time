"use client";

import { supabase } from "@/app/lib/supabase/client";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type UploadOperationProofViaServerParams = {
  moduleSource: string;
  sourceId: string | number;
  typePreuve: "document" | "voice" | "signature";
  file: File;
  categorie?: string | null;
  commentaire?: string | null;
};

export type UploadOperationProofViaServerResult =
  | { ok: true; proofId?: string; storageRef?: string }
  | { ok: false; message: string };

/**
 * Browser → controlled server upload. Never calls storage.upload / getPublicUrl.
 */
export async function uploadOperationProofViaServer(
  params: UploadOperationProofViaServerParams
): Promise<UploadOperationProofViaServerResult> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, message: "Session invalide. Reconnecte-toi." };
  }

  const form = new FormData();
  form.set("module_source", params.moduleSource);
  form.set("source_id", String(params.sourceId));
  form.set("type_preuve", params.typePreuve);
  if (params.categorie != null && params.categorie !== "") {
    form.set("categorie", params.categorie);
  }
  if (params.commentaire != null) {
    form.set("commentaire", params.commentaire);
  }
  form.set("file", params.file, params.file.name || "preuve");

  const response = await fetch("/api/operation-proofs/upload", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    proof?: { id?: string };
    storageRef?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      message: payload.error || "Échec envoi du fichier.",
    };
  }

  return {
    ok: true,
    proofId: payload.proof?.id,
    storageRef: payload.storageRef,
  };
}

export async function fetchOperationProofSignedUrl(
  proofId: string
): Promise<{ ok: true; url: string; expiresIn: number } | { ok: false; message: string }> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, message: "Session invalide. Reconnecte-toi." };
  }

  const response = await fetch("/api/operation-proofs/signed-url", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proofId }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    expiresIn?: number;
  };

  if (!response.ok || !payload.url) {
    return {
      ok: false,
      message: payload.error || "URL signée indisponible.",
    };
  }

  return {
    ok: true,
    url: payload.url,
    expiresIn: payload.expiresIn ?? 300,
  };
}
