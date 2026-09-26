import { describe, expect, it, vi } from "vitest";

vi.mock("undici", () => ({
  Agent: class Agent {},
  request: vi.fn(),
}));

import { request } from "undici";
import {
  classifyMappingClientError,
  dispatchMappingWithUndici,
  mappingHttpStatusError,
} from "@/app/lib/supabase/mapping-undici.server";
import { HORORA_MAPPING_USER_AGENT } from "@/app/lib/supabase/service-role-postgrest.shared";

describe("undici mapping dispatch", () => {
  it("classifies a pre-response undici failure without keeping the message", () => {
    const transport = new Error("getaddrinfo ENOTFOUND host sb_secret_should_not_leak") as Error & {
      code: string;
    };
    transport.code = "ENOTFOUND";
    expect(classifyMappingClientError(transport)).toEqual({
      error_kind: "mapping_transport_error",
    });
    const header = new TypeError("Invalid header value sb_secret_should_not_leak");
    expect(classifyMappingClientError(header).error_kind).toBe("mapping_header_error");
    const url = new TypeError("Invalid URL sb_secret_should_not_leak") as TypeError & {
      code: string;
    };
    url.code = "ERR_INVALID_URL";
    expect(classifyMappingClientError(url).error_kind).toBe("mapping_url_error");
    expect(
      classifyMappingClientError(
        new Error("SUPABASE_SERVICE_ROLE_KEY cannot assume service_role")
      ).error_kind
    ).toBe("mapping_config_error");
    const runtime = new Error("unexpected mapper failure sb_secret_should_not_leak");
    expect(classifyMappingClientError(runtime)).toEqual({
      error_kind: "mapping_runtime_error",
    });
    expect(classifyMappingClientError({ code: "ENOTFOUND", message: runtime.message })).toEqual({
      error_kind: "mapping_runtime_error",
    });
  });

  it("reserves mapping_http_error for failed HTTP responses other than 401", () => {
    expect(mappingHttpStatusError(401)).toMatchObject({
      errorKind: "mapping_http_401",
      httpStatus: "401",
      message: "mapping_http_401",
    });
    expect(mappingHttpStatusError(500)).toMatchObject({
      errorKind: "mapping_http_error",
      httpStatus: "500",
      message: "mapping_http_error",
    });
    expect(mappingHttpStatusError(403).errorKind).toBe("mapping_http_error");
    expect(mappingHttpStatusError(200).errorKind).toBe("mapping_runtime_error");
    expect(mappingHttpStatusError(204).errorKind).toBe("mapping_runtime_error");
    expect(mappingHttpStatusError(200).message).not.toBe("mapping_http_error");
  });

  it("sends sb_secret on apikey only and drops the inbound browser User-Agent", async () => {
    vi.mocked(request).mockResolvedValue({
      statusCode: 401,
      body: {
        text: async () =>
          JSON.stringify({
            message: "Forbidden use of secret API key in browser",
            apikey: "sb_secret_should_not_leak",
            token: "eyJshould-not-leak",
          }),
      },
    } as never);

    const result = await dispatchMappingWithUndici({
      url: "https://example.supabase.co/rest/v1/horora_nexus_identity_map",
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: "sb_secret_test",
        authorization: "Bearer sb_secret_test",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-fetch-dest": "empty",
        origin: "https://time.tagora.ca",
        cookie: "session=sb_secret_test",
      },
    });

    expect(result.status).toBe(401);
    const init = vi.mocked(request).mock.calls[0]?.[1] as {
      headers: Record<string, string>;
      dispatcher: unknown;
    };
    expect(init.headers.apikey).toBe("sb_secret_test");
    expect(init.headers.authorization).toBeUndefined();
    expect(init.headers["user-agent"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(init.headers["x-client-info"]).toBe(HORORA_MAPPING_USER_AGENT);
    expect(init.dispatcher).toBeTruthy();
    const wire = JSON.stringify(init.headers);
    expect(wire).not.toMatch(
      /mozilla|chrome|safari|cookie|sec-fetch|time\.tagora|Forbidden|eyJshould-not-leak/i
    );
  });
});
