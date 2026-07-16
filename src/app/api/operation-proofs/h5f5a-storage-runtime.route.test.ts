import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

const resolveStorageOrganizationContext = vi.hoisted(() => vi.fn());
const assertModuleSourceAccessible = vi.hoisted(() => vi.fn());
const createAdminSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/storage/photos-dossiers-org.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/lib/storage/photos-dossiers-org.server")
  >("@/app/lib/storage/photos-dossiers-org.server");
  return {
    ...actual,
    resolveStorageOrganizationContext,
    assertModuleSourceAccessible,
  };
});

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

import { POST as uploadPost } from "@/app/api/operation-proofs/upload/route";
import { POST as signedPost } from "@/app/api/operation-proofs/signed-url/route";
import { DELETE as deleteProof } from "@/app/api/operation-proofs/[id]/route";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { PHOTOS_DOSSIERS_SIGNED_URL_SECONDS } from "@/app/lib/storage/photos-dossiers-contract.shared";

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser: vi.fn(),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();
const removeMock = vi.fn();

function orgOk() {
  return {
    ok: true as const,
    userId: "user-1",
    user: {
      id: "user-1",
      app_metadata: { role: "direction", permissions: ["livraisons"] },
      user_metadata: {},
    },
    organizationId: ORG,
    membershipId: "m1",
    membershipRole: "direction" as const,
    membershipStatus: "active" as const,
  };
}

describe("H5-F5A operation-proofs storage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveStorageOrganizationContext.mockResolvedValue(orgOk());
    assertModuleSourceAccessible.mockResolvedValue({ ok: true, domain: "livraisons" });
    vi.mocked(getAuthenticatedRequestUser).mockResolvedValue({
      user: orgOk().user as never,
      role: "direction",
      authSource: "bearer",
    });

    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: "https://signed.example/tmp" },
      error: null,
    });
    removeMock.mockResolvedValue({ error: null });

    createAdminSupabaseClient.mockReturnValue({
      storage: {
        from: () => ({
          upload: uploadMock,
          createSignedUrl: createSignedUrlMock,
          remove: removeMock,
        }),
      },
      from: (table: string) => {
        if (table === "operation_proofs") {
          return {
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "proof-1",
                    module_source: "livraison",
                    source_id: "42",
                    type_preuve: "document",
                    categorie: "photo",
                    nom: "a.pdf",
                    mime_type: "application/pdf",
                    taille: 12,
                  },
                  error: null,
                }),
              }),
            }),
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "proof-1",
                    module_source: "livraison",
                    source_id: "42",
                    type_preuve: "document",
                    categorie: "photo",
                    cree_par: "user-1",
                    url_fichier: `storage://photos-dossiers/${ORG}/livraisons/42/a.pdf`,
                    nom: "a.pdf",
                  },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {};
      },
    });
  });

  it("upload requires auth/org and uses upsert=false after authorization", async () => {
    const form = new FormData();
    form.set("module_source", "livraison");
    form.set("source_id", "42");
    form.set("type_preuve", "document");
    form.set("categorie", "photo");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "a.pdf", { type: "application/pdf" }));

    const response = await uploadPost(
      new NextRequest("http://localhost/api/operation-proofs/upload", {
        method: "POST",
        body: form,
      })
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      storageRef?: string;
      proof?: { id: string };
    };
    expect(json.proof?.id).toBe("proof-1");
    expect(json.storageRef?.startsWith("storage://")).toBe(true);
    expect(JSON.stringify(json)).not.toContain("getPublicUrl");
    expect(JSON.stringify(json)).not.toContain("/object/public/");
    expect(uploadMock).toHaveBeenCalled();
    const uploadArgs = uploadMock.mock.calls[0];
    expect(String(uploadArgs[0])).toContain(`${ORG}/livraisons/42/`);
    expect(uploadArgs[2]).toMatchObject({ upsert: false });
  });

  it("upload rejects client organization_id", async () => {
    const form = new FormData();
    form.set("organization_id", ORG);
    form.set("module_source", "livraison");
    form.set("source_id", "42");
    form.set("file", new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" }));
    const response = await uploadPost(
      new NextRequest("http://localhost/api/operation-proofs/upload", {
        method: "POST",
        body: form,
      })
    );
    expect(response.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("upload rejects empty file and forbidden MIME", async () => {
    const empty = new FormData();
    empty.set("module_source", "livraison");
    empty.set("source_id", "42");
    empty.set("file", new File([], "a.pdf", { type: "application/pdf" }));
    expect(
      (
        await uploadPost(
          new NextRequest("http://localhost/api/operation-proofs/upload", {
            method: "POST",
            body: empty,
          })
        )
      ).status
    ).toBe(400);

    const badMime = new FormData();
    badMime.set("module_source", "livraison");
    badMime.set("source_id", "42");
    badMime.set(
      "file",
      new File([new Uint8Array([1])], "a.exe", { type: "application/x-msdownload" })
    );
    expect(
      (
        await uploadPost(
          new NextRequest("http://localhost/api/operation-proofs/upload", {
            method: "POST",
            body: badMime,
          })
        )
      ).status
    ).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("signed url is bounded and refuses arbitrary path", async () => {
    const response = await signedPost(
      new NextRequest("http://localhost/api/operation-proofs/signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proofId: "proof-1" }),
      })
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { expiresIn: number; url: string };
    expect(json.expiresIn).toBe(PHOTOS_DOSSIERS_SIGNED_URL_SECONDS);
    expect(json.expiresIn).toBeLessThanOrEqual(300);
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      expect.stringContaining(`${ORG}/livraisons/42/`),
      PHOTOS_DOSSIERS_SIGNED_URL_SECONDS
    );

    const arbitrary = await signedPost(
      new NextRequest("http://localhost/api/operation-proofs/signed-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `${OTHER}/livraisons/1/x.pdf` }),
      })
    );
    expect(arbitrary.status).toBe(403);
  });

  it("delete is targeted single-object after org validation", async () => {
    const response = await deleteProof(
      new NextRequest("http://localhost/api/operation-proofs/proof-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "proof-1" }) }
    );
    expect(response.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith([`${ORG}/livraisons/42/a.pdf`]);
  });

  it("browser clients no longer call photos-dossiers upload/getPublicUrl", () => {
    const roots = [
      "src/app/components/proofs/OperationProofsPanel.tsx",
      "src/app/components/livraisons/day-delivery/upload-operation-proof.client.ts",
      "src/app/components/livraisons/day-delivery/StopSignatureQuickCapture.tsx",
    ];
    for (const relative of roots) {
      const text = readFileSync(join(process.cwd(), relative), "utf8");
      expect(text).not.toMatch(/storage\.from\(\s*["']photos-dossiers["']\s*\)/);
      expect(text).not.toContain("getPublicUrl");
    }
  });
});
