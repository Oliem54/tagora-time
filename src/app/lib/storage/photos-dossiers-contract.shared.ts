/**
 * H5-F5A — photos-dossiers Option A contract (shared, non-secret).
 * Path format: <organization_id>/<domain>/<record_id>/<unique_file>
 */

export const PHOTOS_DOSSIERS_BUCKET = "photos-dossiers";

export const STORAGE_ORG_DOMAINS = ["documents", "livraisons", "terrain"] as const;
export type StorageOrgDomain = (typeof STORAGE_ORG_DOMAINS)[number];

/** V1 conservative limits (implementation decision — not pre-existing). */
export const PHOTOS_DOSSIERS_MAX_BYTES = 15 * 1024 * 1024; // 15 MiB
export const PHOTOS_DOSSIERS_SIGNED_URL_SECONDS = 300; // 5 minutes

export const PHOTOS_DOSSIERS_ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "webm",
  "ogg",
  "mp3",
  "mp4",
  "wav",
  "m4a",
] as const;

export const PHOTOS_DOSSIERS_ALLOWED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_NAME_RE = /[\\/]|^\.\.?$|\.\./;

export type OperationProofModuleForStorage =
  | "dossier"
  | "livraison"
  | "ramassage"
  | "service_case"
  | "helpdesk_ticket"
  | "delivery_incident";

export function isStorageOrgDomain(value: string): value is StorageOrgDomain {
  return (STORAGE_ORG_DOMAINS as readonly string[]).includes(value);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function mapModuleSourceToStorageDomain(
  moduleSource: string
): StorageOrgDomain | null {
  switch (moduleSource) {
    case "dossier":
      return "documents";
    case "livraison":
    case "ramassage":
      return "livraisons";
    case "service_case":
    case "helpdesk_ticket":
    case "delivery_incident":
      return "terrain";
    default:
      return null;
  }
}

export function permissionForStorageDomain(
  domain: StorageOrgDomain
): "documents" | "livraisons" | "terrain" {
  return domain;
}

export function normalizeStorageFilename(rawName: string): string {
  const base = rawName.trim().split(/[/\\]/).pop() ?? "";
  return base.normalize("NFKC");
}

export function extensionOfFilename(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i <= 0 || i === filename.length - 1) return "";
  return filename.slice(i + 1).toLowerCase();
}

export type FileValidationResult =
  | { ok: true; filename: string; extension: string }
  | { ok: false; reason: string };

export function validatePhotosDossiersFile(input: {
  filename: string;
  mimeType: string | null | undefined;
  size: number;
}): FileValidationResult {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, reason: "Fichier vide." };
  }
  if (input.size > PHOTOS_DOSSIERS_MAX_BYTES) {
    return { ok: false, reason: "Fichier trop volumineux." };
  }

  const rawName = String(input.filename ?? "");
  if (!rawName.trim() || FORBIDDEN_NAME_RE.test(rawName) || rawName.includes("..")) {
    return { ok: false, reason: "Nom de fichier invalide." };
  }

  const filename = normalizeStorageFilename(rawName);
  if (!filename || FORBIDDEN_NAME_RE.test(filename) || filename.includes("..")) {
    return { ok: false, reason: "Nom de fichier invalide." };
  }

  const extension = extensionOfFilename(filename);
  if (
    !extension ||
    !(PHOTOS_DOSSIERS_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return { ok: false, reason: "Extension non autorisée." };
  }

  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (mime) {
    const mimeOk = PHOTOS_DOSSIERS_ALLOWED_MIME_PREFIXES.some(
      (prefix) => mime === prefix || mime.startsWith(prefix)
    );
    if (!mimeOk) {
      return { ok: false, reason: "Type MIME non autorisé." };
    }
  }

  return { ok: true, filename, extension };
}

export type BuildPathResult =
  | { ok: true; path: string; uniqueFilename: string }
  | { ok: false; reason: string };

export function buildOrganizationStoragePath(input: {
  organizationId: string;
  domain: string;
  recordId: string;
  originalFilename: string;
  typePreuve?: string;
  now?: number;
  randomPart?: string;
}): BuildPathResult {
  const organizationId = input.organizationId.trim();
  if (!isUuid(organizationId)) {
    return { ok: false, reason: "Organisation invalide." };
  }
  if (!isStorageOrgDomain(input.domain)) {
    return { ok: false, reason: "Domaine Storage invalide." };
  }

  const recordId = String(input.recordId ?? "").trim();
  if (!recordId || FORBIDDEN_NAME_RE.test(recordId) || recordId.includes(":")) {
    return { ok: false, reason: "Identifiant de ressource invalide." };
  }

  const fileCheck = validatePhotosDossiersFile({
    filename: input.originalFilename,
    mimeType: null,
    size: 1,
  });
  if (!fileCheck.ok) {
    return { ok: false, reason: fileCheck.reason };
  }

  const now = input.now ?? Date.now();
  const randomPart =
    input.randomPart ?? Math.random().toString(36).slice(2, 10);
  const typePrefix = (input.typePreuve ?? "file").replace(/[^a-z0-9_-]/gi, "");
  const uniqueFilename = `${typePrefix || "file"}-${now}-${randomPart}.${fileCheck.extension}`;

  const path = `${organizationId}/${input.domain}/${recordId}/${uniqueFilename}`;
  if (path.includes("..") || path.startsWith("/") || path.includes("//")) {
    return { ok: false, reason: "Chemin Storage invalide." };
  }

  return { ok: true, path, uniqueFilename };
}

/** True when path uses the pre-H5-F5A layout (no org UUID prefix). */
export function isLegacyPhotosDossiersPath(path: string): boolean {
  const first = path.split("/").filter(Boolean)[0] ?? "";
  return first === "operation-proofs" || !isUuid(first);
}

export function pathBelongsToOrganization(
  path: string,
  organizationId: string
): boolean {
  if (isLegacyPhotosDossiersPath(path)) {
    return true; // legacy: org gate is via business resource, not path prefix
  }
  const first = path.split("/").filter(Boolean)[0] ?? "";
  return first === organizationId.trim();
}

/**
 * Extract object path from public/sign URL, storage:// marker, or raw path.
 */
export function extractPhotosDossiersObjectPath(
  urlOrPath: string,
  bucket: string = PHOTOS_DOSSIERS_BUCKET
): string | null {
  const raw = String(urlOrPath ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("storage://")) {
    const rest = raw.slice("storage://".length);
    const prefix = `${bucket}/`;
    if (rest.startsWith(prefix)) {
      return decodeURIComponent(rest.slice(prefix.length));
    }
    return null;
  }

  if (!/^https?:\/\//i.test(raw) && !raw.includes("://")) {
    if (raw.includes("..") || raw.startsWith("/")) return null;
    return raw;
  }

  const marker = `/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(raw.slice(idx + marker.length).split("?")[0] ?? "");
  }
  const marker2 = `/object/sign/${bucket}/`;
  const idx2 = raw.indexOf(marker2);
  if (idx2 >= 0) {
    const pathWithQuery = raw.slice(idx2 + marker2.length);
    const q = pathWithQuery.indexOf("?");
    return decodeURIComponent(q >= 0 ? pathWithQuery.slice(0, q) : pathWithQuery);
  }
  return null;
}

export function toStorageReferenceUrl(path: string): string {
  return `storage://${PHOTOS_DOSSIERS_BUCKET}/${path}`;
}
