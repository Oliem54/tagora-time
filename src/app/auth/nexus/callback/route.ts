import { NextResponse } from "next/server";
import {
  completeNexusCallbackPhaseA,
  inspectNexusHandoff,
  redirectFailClosed,
} from "@/app/lib/auth/nexus-callback.server";
import {
  isNexusCallbackFormPost,
  nexusHandoffContinueResponse,
  nexusHandoffPrefetchSkippedResponse,
  renderNexusHandoffContinueDocument,
  renderNexusOpaqueCodeContinueDocument,
  shouldSkipNexusHandoffConsumeOnGet,
} from "@/app/lib/auth/nexus-callback-document.server";
import {
  exchangeNexusOpaqueHandoffCode,
  publicReasonForOpaqueExchange,
} from "@/app/lib/auth/horora-staging-nexus-opaque-client.server";
import {
  isHororaStagingOpaqueCallbackRequest,
  selectOpaqueHandoffCode,
  type OpaqueHandoffCodeResult,
} from "@/app/lib/auth/horora-staging-nexus-opaque-client";
import {
  evaluateNexusCallbackOrigin,
  nexusCallbackOriginLogFields,
  resolveCanonicalNexusCallbackOrigin,
} from "@/app/lib/auth/nexus-callback-origin.server";
import { isNexusPasswordLoginPath } from "@/app/lib/auth/nexus-handoff-config";
import { applyBrokeredSessionCookieHeader } from "@/app/lib/auth/nexus-brokered-session";
import { isNexusHandoffReplayConsumed } from "@/app/lib/auth/nexus-handoff-replay.server";

export const runtime = "nodejs";

export type NexusCallbackRouteDeps = {
  inspectHandoff?: typeof inspectNexusHandoff;
  completePhaseA?: typeof completeNexusCallbackPhaseA;
  isReplayConsumed?: typeof isNexusHandoffReplayConsumed;
  exchangeOpaqueCode?: typeof exchangeNexusOpaqueHandoffCode;
};

function readOpaqueCodeFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

async function readCallbackPayload(request: Request): Promise<{
  body: unknown;
  opaqueCode: string | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  const lower = contentType.toLowerCase();
  if (lower.includes("application/json")) {
    try {
      const parsed: unknown = await request.json();
      return { body: parsed, opaqueCode: readOpaqueCodeFromUnknown(parsed) };
    } catch {
      return { body: null, opaqueCode: null };
    }
  }
  if (lower.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return {
        body: { handoff: params.get("handoff"), code: params.get("code") },
        opaqueCode: params.get("code"),
      };
    } catch {
      return { body: null, opaqueCode: null };
    }
  }
  return { body: null, opaqueCode: null };
}

function stagingOpaqueCode(request: Request, bodyCode: string | null): OpaqueHandoffCodeResult {
  if (!isHororaStagingOpaqueCallbackRequest(request)) {
    return { ok: false, reason: "absent" };
  }
  let queryCode: string | null = null;
  try {
    queryCode = new URL(request.url).searchParams.get("code");
  } catch {
    return { ok: false, reason: "invalid_code" };
  }
  return selectOpaqueHandoffCode(queryCode, bodyCode);
}

async function mintBrokeredSessionResponse(
  request: Request,
  deps: NexusCallbackRouteDeps,
  body: unknown,
  searchParams: URLSearchParams = new URL(request.url).searchParams
): Promise<NextResponse> {
  const complete = deps.completePhaseA ?? completeNexusCallbackPhaseA;
  const result = await complete({
    searchParams,
    body,
  });
  if (!result.ok) {
    return redirectFailClosed(request.url, result.reason);
  }
  if (isNexusPasswordLoginPath(result.redirectPath)) {
    return redirectFailClosed(request.url, "role_mapping_denied");
  }
  const response = NextResponse.redirect(new URL(result.redirectPath, request.url), 303);
  if (!applyBrokeredSessionCookieHeader(response, result.cookieHeader)) {
    return redirectFailClosed(request.url, "session_mint_unavailable");
  }
  return response;
}

async function handleNexusCallbackGet(
  request: Request,
  deps: NexusCallbackRouteDeps = {}
): Promise<Response> {
  if (shouldSkipNexusHandoffConsumeOnGet(request)) {
    console.info("[horora.nexus.callback]", { decision: "skip_non_document" });
    return nexusHandoffPrefetchSkippedResponse();
  }

  const opaque = stagingOpaqueCode(request, null);
  if (!opaque.ok && (opaque.reason === "invalid_code" || opaque.reason === "code_mismatch")) {
    console.info("[horora.nexus.callback]", { decision: "closed", reason: opaque.reason });
    return redirectFailClosed(request.url, "handoff_missing");
  }
  if (opaque.ok) {
    console.info("[horora.nexus.callback]", { decision: "opaque_code_continue" });
    const publicOrigin = resolveCanonicalNexusCallbackOrigin(request);
    return nexusHandoffContinueResponse(
      renderNexusOpaqueCodeContinueDocument(opaque.code, { publicOrigin })
    );
  }

  const inspect = deps.inspectHandoff ?? inspectNexusHandoff;
  const inspected = await inspect({
    searchParams: new URL(request.url).searchParams,
    body: null,
  });
  if (!inspected.ok) {
    return redirectFailClosed(request.url, inspected.reason);
  }

  const consumedLookup = deps.isReplayConsumed ?? isNexusHandoffReplayConsumed;
  const consumed = await consumedLookup({
    jti: inspected.claims.jti,
    nonce: inspected.claims.nonce,
  });
  if (!consumed.ok) {
    console.info("[horora.nexus.callback]", {
      decision: "closed",
      reason: "store_unavailable",
    });
    return redirectFailClosed(request.url, "store_unavailable");
  }
  if (consumed.consumed) {
    console.info("[horora.nexus.callback]", { decision: "closed", reason: "replay" });
    return redirectFailClosed(request.url, "replay");
  }

  console.info("[horora.nexus.callback]", { decision: "handoff_continue_document" });
  const publicOrigin = resolveCanonicalNexusCallbackOrigin(request);
  return nexusHandoffContinueResponse(
    renderNexusHandoffContinueDocument(inspected.token, { publicOrigin })
  );
}

async function handleNexusCallbackPost(
  request: Request,
  deps: NexusCallbackRouteDeps = {}
): Promise<NextResponse> {
  if (isNexusCallbackFormPost(request)) {
    const originFields = nexusCallbackOriginLogFields(request);
    const originDecision = evaluateNexusCallbackOrigin(request);
    if (!originDecision.ok) {
      console.info("[horora.nexus.callback]", {
        decision: "closed",
        reason: "cross_origin_post",
        failed_origin_check: originDecision.failed_origin_check,
        ...originFields,
      });
      return redirectFailClosed(request.url, "cross_origin_post");
    }
    console.info("[horora.nexus.callback]", {
      decision: "same_origin_post",
      ...originFields,
    });
  }
  const payload = await readCallbackPayload(request);
  const opaque = stagingOpaqueCode(request, payload.opaqueCode);
  if (!opaque.ok && (opaque.reason === "invalid_code" || opaque.reason === "code_mismatch")) {
    console.info("[horora.nexus.callback]", { decision: "closed", reason: opaque.reason });
    return redirectFailClosed(request.url, "handoff_missing");
  }
  if (opaque.ok) {
    if (!isNexusCallbackFormPost(request)) {
      const originDecision = evaluateNexusCallbackOrigin(request);
      if (!originDecision.ok) {
        console.info("[horora.nexus.callback]", {
          decision: "closed",
          reason: "cross_origin_post",
          failed_origin_check: originDecision.failed_origin_check,
        });
        return redirectFailClosed(request.url, "cross_origin_post");
      }
    }
    const exchange = deps.exchangeOpaqueCode ?? exchangeNexusOpaqueHandoffCode;
    const exchanged = await exchange({ code: opaque.code });
    if (!exchanged.ok) {
      console.info("[horora.nexus.callback]", {
        decision: "closed",
        reason: exchanged.reason,
      });
      return redirectFailClosed(request.url, publicReasonForOpaqueExchange(exchanged.reason));
    }
    console.info("[horora.nexus.callback]", { decision: "opaque_code_exchanged" });
    return mintBrokeredSessionResponse(
      request,
      deps,
      { handoff: exchanged.assertion },
      new URLSearchParams()
    );
  }
  return mintBrokeredSessionResponse(request, deps, payload.body);
}

export async function handleNexusCallback(
  request: Request,
  deps: NexusCallbackRouteDeps = {}
): Promise<Response> {
  if (request.method === "GET" || request.method === "HEAD") {
    return handleNexusCallbackGet(request, deps);
  }
  return handleNexusCallbackPost(request, deps);
}

export async function GET(request: Request): Promise<Response> {
  return handleNexusCallback(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleNexusCallbackPost(request);
}
