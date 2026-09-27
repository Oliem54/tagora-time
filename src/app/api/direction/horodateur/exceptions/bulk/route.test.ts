import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireDirectionHorodateurAccess = vi.fn();
const runExceptionBulkAction = vi.fn();
const listExceptionBulkCompanies = vi.fn();

vi.mock("@/app/api/horodateur/_shared", () => ({
  requireDirectionHorodateurAccess,
  buildHorodateurErrorResponse: (error: unknown) =>
    new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "error" }), {
      status: 400,
    }),
}));

vi.mock("@/app/lib/horodateur-v1/horodateur-exception-bulk.server", () => ({
  runExceptionBulkAction,
  listExceptionBulkCompanies,
}));

describe("POST /api/direction/horodateur/exceptions/bulk", () => {
  beforeEach(() => {
    requireDirectionHorodateurAccess.mockReset();
    runExceptionBulkAction.mockReset();
    listExceptionBulkCompanies.mockReset();
  });

  it("refuses an employee before any bulk action", async () => {
    requireDirectionHorodateurAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, code: "forbidden" }), { status: 403 }),
    });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "soft_delete", organizationCompanyId: "company-1" }),
      })
    );
    expect(response.status).toBe(403);
    expect(runExceptionBulkAction).not.toHaveBeenCalled();
  });

  it("forces the session organization and requires a company", async () => {
    requireDirectionHorodateurAccess.mockResolvedValue({
      ok: true,
      organizationId: "org-session",
      user: { id: "user-direction" },
      debug: { auth: { role: "direction" } },
    });
    runExceptionBulkAction.mockResolvedValue({ ok: true, total: 0, rows: [] });
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/direction/horodateur/exceptions/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "preview",
          organizationCompanyId: "company-1",
          filters: { organizationId: "org-other" },
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(runExceptionBulkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-session",
        filter: expect.objectContaining({
          organizationId: "org-session",
          organizationCompanyId: "company-1",
        }),
      })
    );
  });
});
