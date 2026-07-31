import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/app/lib/supabase/server", () => ({
  createPublicServerSupabaseClient: vi.fn(),
}));

import { getRequestAccessToken } from "@/app/lib/account-requests.server";
import { APP_SESSION_COOKIE_NAME } from "@/app/lib/auth/session-cookie";

describe("getRequestAccessToken — Bearer vs cookie priority", () => {
  it("uses Bearer exclusively when Bearer and cookie disagree", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: {
        authorization: "Bearer bearer-user-token",
        cookie: `${APP_SESSION_COOKIE_NAME}=cookie-other-user-token`,
      },
    });

    const access = getRequestAccessToken(req);
    expect(access.source).toBe("bearer");
    expect(access.token).toBe("bearer-user-token");
    expect(access.token).not.toBe("cookie-other-user-token");
  });

  it("falls back to cookie only when Bearer is absent", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: {
        cookie: `${APP_SESSION_COOKIE_NAME}=cookie-only-token`,
      },
    });

    const access = getRequestAccessToken(req);
    expect(access.source).toBe("cookie");
    expect(access.token).toBe("cookie-only-token");
  });
});
