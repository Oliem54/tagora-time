/**
 * Same-origin handoff completion after a Nexus GET callback.
 * GET never consumes or mints. POST consume+mint stays fail-closed.
 */

import { parseTrustedWebOrigin } from "@/app/lib/auth/nexus-callback-origin.server";

export const NEXUS_CALLBACK_CONTINUE_PATH = "/auth/nexus/callback" as const;
export const NEXUS_CALLBACK_CONTINUE_FORM_ID = "horora-nexus-handoff" as const;

export {
  isSameOriginNexusCallbackPost,
  parseTrustedWebOrigin,
  resolveCanonicalNexusCallbackOrigin,
} from "@/app/lib/auth/nexus-callback-origin.server";

export type NexusHandoffContinueDocumentOptions = {
  readonly publicOrigin?: string | null;
};

export function nexusCallbackContinueFormAction(publicOrigin?: string | null): string {
  const origin = publicOrigin ? parseTrustedWebOrigin(publicOrigin) : null;
  return origin ? `${origin}${NEXUS_CALLBACK_CONTINUE_PATH}` : NEXUS_CALLBACK_CONTINUE_PATH;
}

export function shouldSkipNexusHandoffConsumeOnGet(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const purpose = `${request.headers.get("sec-purpose") ?? ""} ${
    request.headers.get("purpose") ?? ""
  }`;
  if (/\bprefetch\b/i.test(purpose) || /\bprerender\b/i.test(purpose)) {
    return true;
  }
  const dest = (request.headers.get("sec-fetch-dest") ?? "").toLowerCase();
  return dest === "empty" || dest === "cors";
}

export function isNexusCallbackFormPost(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/x-www-form-urlencoded");
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderNexusHandoffContinueDocument(
  token: string,
  options?: NexusHandoffContinueDocumentOptions
): string {
  const safeToken = escapeHtmlAttribute(token);
  const action = escapeHtmlAttribute(nexusCallbackContinueFormAction(options?.publicOrigin));
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="strict-origin" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>HORORA</title>
</head>
<body>
  <p>Ouverture de HORORA…</p>
  <form id="${NEXUS_CALLBACK_CONTINUE_FORM_ID}" method="post" action="${action}" accept-charset="UTF-8" autocomplete="off">
    <input type="hidden" name="handoff" value="${safeToken}" />
    <noscript><button type="submit">Continuer</button></noscript>
  </form>
  <script>
    (function () {
      var form = document.getElementById(${JSON.stringify(NEXUS_CALLBACK_CONTINUE_FORM_ID)});
      if (!form) return;
      function submit() { form.submit(); }
      if (document.prerendering) {
        document.addEventListener("prerenderingchange", submit, { once: true });
        return;
      }
      submit();
    })();
  </script>
</body>
</html>`;
}

export function nexusHandoffContinueResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "referrer-policy": "strict-origin",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    },
  });
}

export function nexusHandoffPrefetchSkippedResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
