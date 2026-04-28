import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import {
  type ArchiveRow,
  type ProofRow,
  buildSafeArchiveFilename,
  ensureUniqueFilename,
  extractStoragePathFromProofUrl,
  firstText,
  logArchiveAction,
  operationType,
  operationTypeLabel,
  requireDirectionOrAdminApi,
  safeFilenamePart,
} from "@/app/api/direction/livraisons-ramassages/archives/_lib";

async function downloadProofBinary(
  supabase: ReturnType<typeof requireDirectionOrAdminApi> extends Promise<infer T>
    ? T extends { ok: true; supabase: infer S }
      ? S
      : never
    : never,
  proof: ProofRow
) {
  if (proof.url_fichier) {
    const storagePath = extractStoragePathFromProofUrl(proof.url_fichier, "photos-dossiers");
    if (storagePath) {
      const storageRes = await supabase.storage.from("photos-dossiers").download(storagePath);
      if (!storageRes.error && storageRes.data) {
        const arrayBuffer = await storageRes.data.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    }

    try {
      const response = await fetch(proof.url_fichier);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    } catch {
      // Keep processing other files.
    }
  }
  return null;
}

function fileExtensionFromMime(mimeType: string | null) {
  if (!mimeType) return "";
  if (mimeType.includes("pdf")) return ".pdf";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("json")) return ".json";
  if (mimeType.includes("plain")) return ".txt";
  return "";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdminApi(req);
    if (!auth.ok) return auth.response;
    const { supabase, user, role } = auth;

    const { id } = await params;
    const operationId = Number(id);
    if (!Number.isFinite(operationId) || operationId <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const rowRes = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("id", operationId)
      .maybeSingle();
    if (rowRes.error || !rowRes.data) {
      return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    }

    const row = rowRes.data as ArchiveRow;
    const type = operationType(row);

    const [dossierRes, proofsRes] = await Promise.all([
      Number.isFinite(Number(row.dossier_id))
        ? supabase.from("dossiers").select("*").eq("id", Number(row.dossier_id)).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("operation_proofs")
        .select("*")
        .eq("module_source", type)
        .eq("source_id", String(operationId))
        .order("date_heure", { ascending: false }),
    ]);
    const dossier = dossierRes.data as ArchiveRow | null;
    const proofs = (proofsRes.data ?? []) as ProofRow[];

    const zip = new JSZip();
    const photosFolder = zip.folder("photos");
    const signaturesFolder = zip.folder("signatures");
    const documentsFolder = zip.folder("documents");
    const evidencesFolder = zip.folder("preuves");
    const othersFolder = zip.folder("autres");
    const filenameCounters = new Map<string, number>();
    const includedDocuments: string[] = [];

    for (const proof of proofs) {
      const binary = await downloadProofBinary(supabase, proof);
      if (!binary) continue;

      const baseName =
        buildSafeArchiveFilename(proof.nom || `${proof.type_preuve}-${proof.id}`, `fichier-${proof.id}`);
      const extension = baseName.includes(".") ? "" : fileExtensionFromMime(proof.mime_type);
      let filename = `${baseName}${extension}`;
      let folderKey = "autres";

      if (proof.type_preuve === "signature") {
        folderKey = "signatures";
        filename = ensureUniqueFilename(folderKey, filename, filenameCounters);
        signaturesFolder?.file(filename, binary);
      } else if (proof.mime_type?.startsWith("image/")) {
        folderKey = "photos";
        filename = ensureUniqueFilename(folderKey, filename, filenameCounters);
        photosFolder?.file(filename, binary);
      } else if (proof.mime_type?.includes("pdf")) {
        folderKey = "documents";
        filename = ensureUniqueFilename(folderKey, filename, filenameCounters);
        documentsFolder?.file(filename, binary);
      } else if (
        proof.type_preuve === "document" ||
        proof.type_preuve === "voice" ||
        proof.type_preuve === "note"
      ) {
        folderKey = "preuves";
        filename = ensureUniqueFilename(folderKey, filename, filenameCounters);
        evidencesFolder?.file(filename, binary);
      } else {
        folderKey = "autres";
        filename = ensureUniqueFilename(folderKey, filename, filenameCounters);
        othersFolder?.file(filename, binary);
      }

      includedDocuments.push(`${folderKey}/${filename} [${proof.type_preuve}${proof.categorie ? `:${proof.categorie}` : ""}]`);
    }

    const summary = [
      `Type: ${operationTypeLabel(type)}`,
      `Date prevue: ${firstText(row, ["date_livraison", "date_prevue"]) || "-"}`,
      `Date reelle: ${firstText(row, ["date_reelle", "date_effective"]) || "-"}`,
      `Heure depart: ${firstText(row, ["heure_depart"]) || "-"}`,
      `Heure arrivee: ${firstText(row, ["heure_arrivee"]) || "-"}`,
      `Nom client: ${firstText(row, ["client", "nom_client"]) || firstText(dossier ?? undefined, ["client", "nom_client", "nom"]) || "-"}`,
      `Adresse complete: ${firstText(row, ["adresse", "adresse_livraison", "adresse_ramassage"]) || firstText(dossier ?? undefined, ["adresse"]) || "-"}`,
      `Numero commande: ${firstText(row, ["numero_commande", "commande"]) || firstText(dossier ?? undefined, ["numero_commande", "commande", "reference", "numero"]) || "-"}`,
      `Numero facture: ${firstText(row, ["numero_facture", "facture"]) || firstText(dossier ?? undefined, ["numero_facture", "facture"]) || "-"}`,
      `Chauffeur assigne: ${firstText(row, ["chauffeur_id"]) || "-"}`,
      `Vehicule: ${firstText(row, ["vehicule_id"]) || "-"}`,
      `Remorque: ${firstText(row, ["remorque_id"]) || "-"}`,
      `Kilometrage depart: ${firstText(row, ["kilometrage_depart", "km_depart"]) || "-"}`,
      `Kilometrage arrivee: ${firstText(row, ["kilometrage_arrivee", "km_arrivee"]) || "-"}`,
      `Notes internes: ${firstText(row, ["notes_internes", "notes"]) || "-"}`,
      `Notes chauffeur: ${firstText(row, ["notes_chauffeur"]) || "-"}`,
      `Statut du dossier: ${firstText(row, ["statut"]) || "-"}`,
      `Nombre de preuves/documents: ${proofs.length}`,
      "",
      "Documents inclus dans le ZIP:",
      ...(includedDocuments.length > 0 ? includedDocuments.map((item) => `- ${item}`) : ["- Aucun document"]),
    ].join("\n");
    zip.file("resume-dossier.txt", summary);

    const order = safeFilenamePart(
      firstText(row, ["numero_commande", "commande"]) ||
        firstText(dossier ?? undefined, ["numero_commande", "commande", "reference", "numero"]) ||
        "commande"
    );
    const invoice = safeFilenamePart(
      firstText(row, ["numero_facture", "facture"]) ||
        firstText(dossier ?? undefined, ["numero_facture", "facture"]) ||
        "facture"
    );
    const client = safeFilenamePart(
      firstText(row, ["client", "nom_client"]) ||
        firstText(dossier ?? undefined, ["client", "nom_client", "nom"]) ||
        "client"
    );
    const date = safeFilenamePart(
      firstText(row, ["date_livraison", "date_prevue"]) || new Date().toISOString().slice(0, 10)
    );
    const zipName = `${operationTypeLabel(type)}_COMMANDE-${order}_FACTURE-${invoice}_${client}-${date}.zip`;

    const content = await zip.generateAsync({ type: "uint8array" });

    await logArchiveAction({
      req,
      supabase,
      dossierId: operationId,
      dossierType: type,
      action: "download_zip",
      user,
      role,
      details: {
        includedDocumentCount: includedDocuments.length,
      },
    });

    const body = new ArrayBuffer(content.byteLength);
    new Uint8Array(body).set(content);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${zipName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur ZIP.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
