import { NextRequest, NextResponse } from "next/server";
import { getStrictDirectionRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export type ArchiveRow = Record<string, string | number | null | undefined>;

export type ProofRow = {
  id: string;
  module_source: "livraison" | "ramassage";
  source_id: string;
  type_preuve: string;
  categorie: string | null;
  nom: string;
  date_heure: string;
  cree_par: string | null;
  url_fichier: string;
  mime_type: string | null;
  taille: number | null;
  commentaire: string | null;
};

export type ArchiveAuditAction =
  | "view_dossier"
  | "download_zip"
  | "open_document"
  | "download_document"
  | "update_dossier"
  | "add_document"
  | "delete_document";

export function firstText(row: ArchiveRow | undefined, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

export function operationType(row: ArchiveRow): "livraison" | "ramassage" {
  return row.type_operation === "ramassage_client" ? "ramassage" : "livraison";
}

export function safeFilenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function buildSafeArchiveFilename(name: string, fallback: string) {
  const base = safeFilenamePart(name || "");
  const selected = base || safeFilenamePart(fallback) || "fichier";
  return selected.replace(/[\\/]/g, "-");
}

export function ensureUniqueFilename(
  folderKey: string,
  filename: string,
  counters: Map<string, number>
) {
  const normalized = filename.replace(/[\\/]/g, "-").trim() || "fichier";
  const dotIndex = normalized.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < normalized.length - 1;
  const stem = hasExt ? normalized.slice(0, dotIndex) : normalized;
  const ext = hasExt ? normalized.slice(dotIndex) : "";
  const key = `${folderKey}:${normalized.toLowerCase()}`;
  const current = counters.get(key) ?? 0;
  counters.set(key, current + 1);
  if (current === 0) {
    return normalized;
  }
  return `${stem}-${current + 1}${ext}`;
}

export function operationTypeLabel(value: "livraison" | "ramassage") {
  return value === "ramassage" ? "ramassage" : "livraison";
}

export async function requireDirectionOrAdminApi(req: NextRequest) {
  const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
  if (mfaError) {
    return {
      ok: false as const,
      response: mfaError,
    };
  }
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentification requise." }, { status: 401 }),
    };
  }
  if (role !== "direction" && role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  return { ok: true as const, user, role, supabase: createAdminSupabaseClient() };
}

export function toArchiveEntry(
  row: ArchiveRow,
  options: {
    dossiersById: Map<number, ArchiveRow>;
    chauffeursById: Map<number, ArchiveRow>;
    vehiculesById: Map<number, ArchiveRow>;
    remorquesById: Map<number, ArchiveRow>;
    proofCountByKey: Map<string, number>;
  }
) {
  const { dossiersById, chauffeursById, vehiculesById, remorquesById, proofCountByKey } = options;
  const type = operationType(row);
  const dossier = Number.isFinite(Number(row.dossier_id))
    ? dossiersById.get(Number(row.dossier_id))
    : undefined;
  const chauffeur = Number.isFinite(Number(row.chauffeur_id))
    ? chauffeursById.get(Number(row.chauffeur_id))
    : undefined;
  const vehicule = Number.isFinite(Number(row.vehicule_id))
    ? vehiculesById.get(Number(row.vehicule_id))
    : undefined;
  const remorque = Number.isFinite(Number(row.remorque_id))
    ? remorquesById.get(Number(row.remorque_id))
    : undefined;

  const client =
    firstText(row, ["client", "nom_client"]) ||
    firstText(dossier, ["client", "nom_client", "nom"]);
  const address =
    firstText(row, ["adresse", "adresse_livraison", "adresse_ramassage"]) ||
    firstText(dossier, ["adresse", "adresse_livraison", "adresse_ramassage"]);
  const commande =
    firstText(row, ["numero_commande", "commande"]) ||
    firstText(dossier, ["numero_commande", "commande", "reference", "numero"]);
  const facture =
    firstText(row, ["numero_facture", "facture"]) ||
    firstText(dossier, ["numero_facture", "facture"]);
  const phone =
    firstText(row, ["telephone_client", "telephone"]) ||
    firstText(dossier, ["telephone_client", "telephone"]);
  const email =
    firstText(row, ["courriel_client", "email_client", "courriel"]) ||
    firstText(dossier, ["courriel_client", "email_client", "courriel"]);
  const company =
    firstText(row, ["company_context", "company", "compagnie"]) ||
    firstText(dossier, ["company_context", "company", "compagnie"]);
  const chauffeurLabel =
    firstText(chauffeur, ["nom_complet", "nom", "name"]) ||
    `${firstText(chauffeur, ["prenom"])} ${firstText(chauffeur, ["nom"])}`.trim();
  const vehiculeLabel = firstText(vehicule, ["nom", "modele", "plaque", "identifiant", "numero"]);
  const remorqueLabel = firstText(remorque, ["nom", "modele", "plaque", "identifiant", "numero"]);
  const proofKey = `${type}:${String(row.id)}`;
  const proofCount = proofCountByKey.get(proofKey) ?? 0;

  return {
    id: Number(row.id),
    type,
    status: firstText(row, ["statut"]),
    plannedDate: firstText(row, ["date_livraison", "date_prevue"]),
    client,
    address,
    commande,
    facture,
    phone,
    email,
    company,
    chauffeurLabel,
    vehiculeLabel,
    remorqueLabel,
    proofCount,
  };
}

export function extractStoragePathFromProofUrl(url: string, bucket: string) {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(url.slice(idx + marker.length));
  }
  const marker2 = `/object/sign/${bucket}/`;
  const idx2 = url.indexOf(marker2);
  if (idx2 >= 0) {
    const pathWithQuery = url.slice(idx2 + marker2.length);
    const q = pathWithQuery.indexOf("?");
    return decodeURIComponent(q >= 0 ? pathWithQuery.slice(0, q) : pathWithQuery);
  }
  return null;
}

export async function logArchiveAction(options: {
  req: NextRequest;
  supabase: ReturnType<typeof createAdminSupabaseClient>;
  dossierId: number;
  dossierType: "livraison" | "ramassage";
  action: ArchiveAuditAction;
  user: { id?: string; email?: string | null };
  role: "direction" | "admin";
  details?: Record<string, unknown>;
  documentId?: string | null;
  documentName?: string | null;
}) {
  try {
    const forwardedFor = options.req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor?.split(",")[0]?.trim() || options.req.headers.get("x-real-ip") || null;
    const userAgent = options.req.headers.get("user-agent") || null;

    await options.supabase.from("livraison_ramassage_audit_logs").insert({
      dossier_id: options.dossierId,
      dossier_type: options.dossierType,
      action: options.action,
      user_id: options.user.id ?? null,
      user_email: options.user.email ?? null,
      user_role: options.role,
      details: options.details ?? {},
      ip_address: ipAddress,
      user_agent: userAgent,
      document_id: options.documentId ?? null,
      document_name: options.documentName ?? null,
    });
  } catch (error) {
    console.error("[archives-audit] log failure", error);
  }
}
