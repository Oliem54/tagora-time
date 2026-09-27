import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LOCAL_IMPROVEMENT_INTAKE_CLOSED_MESSAGE } from "@/app/lib/improvements";

vi.mock("server-only", () => ({}));

const getAuthenticatedRequestUser = vi.fn();
const createAdminSupabaseClient = vi.fn();

vi.mock("@/app/lib/account-requests.server", () => ({
  getAuthenticatedRequestUser,
}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient,
}));

function postRequest() {
  return new NextRequest("http://localhost/api/ameliorations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      module: "Generalites",
      priority: "Moyenne",
      title: "Suggestion locale",
      description: "Ne doit pas etre enregistree.",
    }),
  });
}

describe("POST /api/ameliorations", () => {
  beforeEach(() => {
    getAuthenticatedRequestUser.mockReset();
    createAdminSupabaseClient.mockReset();
  });

  it("returns 410 Gone for an authenticated creation attempt", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({
      user: { id: "user-employe" },
      role: "employe",
    });

    const { POST } = await import("./route");
    const response = await POST(postRequest());
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(410);
    expect(payload.error).toBe(LOCAL_IMPROVEMENT_INTAKE_CLOSED_MESSAGE);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("keeps 401 when the request is not authenticated", async () => {
    getAuthenticatedRequestUser.mockResolvedValue({
      user: null,
      role: null,
    });

    const { POST } = await import("./route");
    const response = await POST(postRequest());

    expect(response.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
