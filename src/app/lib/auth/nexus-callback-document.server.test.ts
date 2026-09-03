import { describe, expect, it } from "vitest";
import {
  NEXUS_CALLBACK_CONTINUE_FORM_ID,
  escapeHtmlAttribute,
  renderNexusHandoffContinueDocument,
  shouldSkipNexusHandoffConsumeOnGet,
} from "@/app/lib/auth/nexus-callback-document.server";

describe("Nexus callback continue document", () => {
  it("renders HORORA continue HTML that auto-POSTs the handoff", () => {
    const html = renderNexusHandoffContinueDocument("abc.def.ghi", {
      publicOrigin: "https://time.staging.tagora.ca",
    });
    expect(html).toContain("<title>HORORA</title>");
    expect(html).toContain(NEXUS_CALLBACK_CONTINUE_FORM_ID);
    expect(html).toContain('action="https://time.staging.tagora.ca/auth/nexus/callback"');
    expect(html).toContain('name="handoff" value="abc.def.ghi"');
    expect(html).toContain("form.submit()");
    expect(html).not.toMatch(/localStorage|sessionStorage/);
  });

  it("escapes HTML attribute characters in the token", () => {
    expect(escapeHtmlAttribute(`a"b<c>`)).toBe("a&quot;b&lt;c&gt;");
  });

  it("skips prefetch, prerender, and cors GET", () => {
    expect(
      shouldSkipNexusHandoffConsumeOnGet(
        new Request("https://time.example/auth/nexus/callback", {
          headers: { "sec-purpose": "prefetch" },
        })
      )
    ).toBe(true);
    expect(
      shouldSkipNexusHandoffConsumeOnGet(
        new Request("https://time.example/auth/nexus/callback", {
          headers: { purpose: "prefetch" },
        })
      )
    ).toBe(true);
    expect(
      shouldSkipNexusHandoffConsumeOnGet(
        new Request("https://time.example/auth/nexus/callback", {
          headers: { "sec-fetch-dest": "cors" },
        })
      )
    ).toBe(true);
    expect(
      shouldSkipNexusHandoffConsumeOnGet(
        new Request("https://time.example/auth/nexus/callback", {
          headers: { "sec-fetch-dest": "empty" },
        })
      )
    ).toBe(true);
    expect(
      shouldSkipNexusHandoffConsumeOnGet(
        new Request("https://time.example/auth/nexus/callback", {
          headers: { "sec-fetch-dest": "document" },
        })
      )
    ).toBe(false);
  });
});
