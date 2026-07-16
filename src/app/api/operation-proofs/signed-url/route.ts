import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  PHOTOS_DOSSIERS_BUCKET,
  PHOTOS_DOSSIERS_SIGNED_URL_SECONDS,
} from "@/app/lib/storage/photos-dossiers-contract.shared";
import {
  assertModuleSourceAccessible,
  assertObjectPathReadableByOrganization,
  resolveStorageOrganizationContext,
  storageOrgFailureMessage,
} from "@/app/lib/storage/photos-dossiers-org.server";

export const runtime = "nodejs";

type ProofRow = {
  id: string;
  module_source: string;
  source_id: string;
  url_fichier: string;
};

/**
 * POST { proofId } or GET ?proofId=
 * Returns a short-lived signed URL. Never logs the full URL.
 */
async function resolveSignedUrl(req: NextRequest) {
  const org = await resolveStorageOrganizationContext(req);
  if (!org.ok) {
    return NextResponse.json(
      { error: storageOrgFailureMessage(org.reason) },
      { status: org.status }
    );
  }

  let proofId = "";
  let clientPath = "";

  if (req.method === "GET") {
    proofId = String(req.nextUrl.searchParams.get("proofId") ?? "").trim();
    clientPath = String(req.nextUrl.searchParams.get("path") ?? "").trim();
  } else {
    const body = (await req.json().catch(() => ({}))) as {
      proofId?: string;
      path?: string;
      organization_id?: string;
      organizationId?: string;
    };
    if (body.organization_id || body.organizationId) {
      return NextResponse.json(
        { error: "Organisation client non autorisée." },
        { status: 403 }
      );
    }
    proofId = String(body.proofId ?? "").trim();
    clientPath = String(body.path ?? "").trim();
  }

  // Arbitrary client path without proofId is refused.
  if (clientPath && !proofId) {
    return NextResponse.json({ error: "Chemin arbitraire refusé." }, { status: 403 });
  }

  if (!proofId) {
    return NextResponse.json({ error: "Identifiant de preuve requis." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("operation_proofs")
    .select("id, module_source, source_id, url_fichier")
    .eq("id", proofId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Lecture impossible." }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const proof = data as ProofRow;

  const access = await assertModuleSourceAccessible({
    user: org.user,
    moduleSource: proof.module_source,
    sourceId: proof.source_id,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Opération Storage refusée." }, { status: access.status });
  }

  const pathCheck = assertObjectPathReadableByOrganization({
    urlOrPath: proof.url_fichier,
    organizationId: org.organizationId,
  });
  if (!pathCheck.ok) {
    return NextResponse.json({ error: "Opération Storage refusée." }, { status: 403 });
  }

  if (clientPath && clientPath !== pathCheck.path) {
    return NextResponse.json({ error: "Chemin arbitraire refusé." }, { status: 403 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(PHOTOS_DOSSIERS_BUCKET)
    .createSignedUrl(pathCheck.path, PHOTOS_DOSSIERS_SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.warn("[operation-proofs/signed-url] sign failed");
    return NextResponse.json({ error: "URL signée indisponible." }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    proofId: proof.id,
    expiresIn: PHOTOS_DOSSIERS_SIGNED_URL_SECONDS,
    url: signed.signedUrl,
  });
}

export async function GET(req: NextRequest) {
  try {
    return await resolveSignedUrl(req);
  } catch {
    console.warn("[operation-proofs/signed-url] unexpected failure");
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await resolveSignedUrl(req);
  } catch {
    console.warn("[operation-proofs/signed-url] unexpected failure");
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
