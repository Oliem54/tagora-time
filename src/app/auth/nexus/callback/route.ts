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
  shouldSkipNexusHandoffConsumeOnGet,
} from "@/app/lib/auth/nexus-callback-document.server";
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
};

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const lower = contentType.toLowerCase();
  if (lower.includes("application/json")) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }
  if (lower.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await request.text();
      const params = new URLSearchParams(text);
      const handoff = params.get("handoff");
      return { handoff };
    } catch {
      return null;
    }
  }
  return null;
}

async function mintBrokeredSessionResponse(
  request: Request,
  deps: NexusCallbackRouteDeps,
  body: unknown
): Promise<NextResponse> {
  const complete = deps.completePhaseA ?? completeNexusCallbackPhaseA;
  const result = await complete({
    searchParams: new URL(request.url).searchParams,
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
  return mintBrokeredSessionResponse(request, deps, await readBody(request));
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
