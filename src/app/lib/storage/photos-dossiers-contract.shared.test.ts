import { describe, expect, it } from "vitest";
import {
  buildOrganizationStoragePath,
  extractPhotosDossiersObjectPath,
  isLegacyPhotosDossiersPath,
  mapModuleSourceToStorageDomain,
  pathBelongsToOrganization,
  PHOTOS_DOSSIERS_MAX_BYTES,
  toStorageReferenceUrl,
  validatePhotosDossiersFile,
} from "@/app/lib/storage/photos-dossiers-contract.shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("H5-F5A photos-dossiers path contract", () => {
  it("prefixes organization_id server-side and never emits legacy format", () => {
    const built = buildOrganizationStoragePath({
      organizationId: ORG,
      domain: "livraisons",
      recordId: "42",
      originalFilename: "bon.pdf",
      typePreuve: "document",
      now: 1000,
      randomPart: "abc",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.path).toBe(`${ORG}/livraisons/42/document-1000-abc.pdf`);
    expect(built.path.startsWith("operation-proofs/")).toBe(false);
    expect(isLegacyPhotosDossiersPath(built.path)).toBe(false);
  });

  it("maps modules to domains", () => {
    expect(mapModuleSourceToStorageDomain("dossier")).toBe("documents");
    expect(mapModuleSourceToStorageDomain("livraison")).toBe("livraisons");
    expect(mapModuleSourceToStorageDomain("ramassage")).toBe("livraisons");
    expect(mapModuleSourceToStorageDomain("service_case")).toBe("terrain");
    expect(mapModuleSourceToStorageDomain("unknown")).toBeNull();
  });

  it("rejects invalid domain, recordId, traversal, slash, empty name, bad extension", () => {
    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "finance",
        recordId: "1",
        originalFilename: "a.pdf",
      }).ok
    ).toBe(false);

    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "documents",
        recordId: "../x",
        originalFilename: "a.pdf",
      }).ok
    ).toBe(false);

    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "documents",
        recordId: "a/b",
        originalFilename: "a.pdf",
      }).ok
    ).toBe(false);

    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "documents",
        recordId: "1",
        originalFilename: "",
      }).ok
    ).toBe(false);

    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "documents",
        recordId: "1",
        originalFilename: "evil.exe",
      }).ok
    ).toBe(false);

    expect(
      buildOrganizationStoragePath({
        organizationId: ORG,
        domain: "documents",
        recordId: "1",
        originalFilename: "../../x.pdf",
      }).ok
    ).toBe(false);
  });

  it("produces unique names for identical inputs with different entropy", () => {
    const a = buildOrganizationStoragePath({
      organizationId: ORG,
      domain: "documents",
      recordId: "1",
      originalFilename: "a.pdf",
      now: 1,
      randomPart: "aaa",
    });
    const b = buildOrganizationStoragePath({
      organizationId: ORG,
      domain: "documents",
      recordId: "1",
      originalFilename: "a.pdf",
      now: 1,
      randomPart: "bbb",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.path).not.toBe(b.path);
  });

  it("validates file size/MIME/empty", () => {
    expect(
      validatePhotosDossiersFile({ filename: "a.pdf", mimeType: "application/pdf", size: 0 }).ok
    ).toBe(false);
    expect(
      validatePhotosDossiersFile({
        filename: "a.pdf",
        mimeType: "application/pdf",
        size: PHOTOS_DOSSIERS_MAX_BYTES + 1,
      }).ok
    ).toBe(false);
    expect(
      validatePhotosDossiersFile({
        filename: "a.pdf",
        mimeType: "application/x-msdownload",
        size: 10,
      }).ok
    ).toBe(false);
    expect(
      validatePhotosDossiersFile({
        filename: "a.pdf",
        mimeType: "application/pdf",
        size: 10,
      }).ok
    ).toBe(true);
  });

  it("detects legacy paths and org ownership", () => {
    expect(isLegacyPhotosDossiersPath("operation-proofs/livraison/1/a.pdf")).toBe(true);
    expect(pathBelongsToOrganization(`${ORG}/livraisons/1/a.pdf`, ORG)).toBe(true);
    expect(pathBelongsToOrganization(`${OTHER}/livraisons/1/a.pdf`, ORG)).toBe(false);
    expect(
      pathBelongsToOrganization("operation-proofs/livraison/1/a.pdf", ORG)
    ).toBe(true);
  });

  it("extracts paths from public, sign, storage:// and raw", () => {
    expect(
      extractPhotosDossiersObjectPath(
        `https://x.supabase.co/storage/v1/object/public/photos-dossiers/${ORG}/livraisons/1/a.pdf`
      )
    ).toBe(`${ORG}/livraisons/1/a.pdf`);
    expect(
      extractPhotosDossiersObjectPath(
        `https://x.supabase.co/storage/v1/object/sign/photos-dossiers/${ORG}/livraisons/1/a.pdf?token=abc`
      )
    ).toBe(`${ORG}/livraisons/1/a.pdf`);
    expect(
      extractPhotosDossiersObjectPath(toStorageReferenceUrl(`${ORG}/livraisons/1/a.pdf`))
    ).toBe(`${ORG}/livraisons/1/a.pdf`);
    expect(extractPhotosDossiersObjectPath(`${ORG}/livraisons/1/a.pdf`)).toBe(
      `${ORG}/livraisons/1/a.pdf`
    );
  });
});
