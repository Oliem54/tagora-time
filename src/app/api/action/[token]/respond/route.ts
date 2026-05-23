import { NextRequest, NextResponse } from "next/server";

import {
  APP_ACTION_RESPONSES,
  type AppActionResponse,
} from "@/app/lib/app-action-tokens.shared";
import {
  consumeAppActionToken,
  findAppActionTokenByRawToken,
} from "@/app/lib/app-action-tokens.server";
import { executeAppActionHandler } from "@/app/lib/app-action-handlers.server";

const LOG = "[app-action-respond]";

function resolveClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  let body: { response?: unknown; responseNote?: unknown };
  try {
    body = (await req.json()) as { response?: unknown; responseNote?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corps de requete invalide." },
      { status: 400 }
    );
  }

  const responseRaw =
    typeof body.response === "string" ? body.response.trim().toLowerCase() : "";
  if (!APP_ACTION_RESPONSES.includes(responseRaw as AppActionResponse)) {
    return NextResponse.json(
      { ok: false, error: "Reponse invalide. Utilisez accept ou reject." },
      { status: 400 }
    );
  }

  const response = responseRaw as AppActionResponse;
  const responseNote =
    typeof body.responseNote === "string" ? body.responseNote : null;

  if (response === "reject" && !responseNote?.trim()) {
    return NextResponse.json(
      { ok: false, error: "La raison est obligatoire pour un refus." },
      { status: 400 }
    );
  }

  let row: Awaited<ReturnType<typeof findAppActionTokenByRawToken>>;
  try {
    row = await findAppActionTokenByRawToken(rawToken);
  } catch (error) {
    console.error(LOG, "lookup_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Impossible de valider le lien pour le moment." },
      { status: 500 }
    );
  }

  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Ce lien n'est pas reconnu." },
      { status: 400 }
    );
  }

  if (row.status === "used") {
    return NextResponse.json(
      { ok: false, code: "already_used", error: "Ce lien a deja ete utilise." },
      { status: 409 }
    );
  }

  if (row.status === "cancelled") {
    return NextResponse.json(
      { ok: false, code: "invalid_token", error: "Ce lien n'est plus actif." },
      { status: 400 }
    );
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (row.status === "expired" || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return NextResponse.json(
      { ok: false, code: "expired", error: "Ce lien a expire." },
      { status: 410 }
    );
  }

  const handlerResult = await executeAppActionHandler({
    row,
    response,
    responseNote,
  });

  if (!handlerResult.ok) {
    const status =
      handlerResult.code === "already_handled"
        ? 409
        : handlerResult.code === "configuration_missing"
          ? 503
          : handlerResult.code === "target_not_found"
            ? 404
            : 400;

    return NextResponse.json(
      {
        ok: false,
        code: handlerResult.code,
        error: handlerResult.message,
      },
      { status }
    );
  }

  try {
    const consumed = await consumeAppActionToken({
      rawToken,
      response,
      responseNote,
      responderIp: resolveClientIp(req),
      responderUserAgent: req.headers.get("user-agent"),
    });

    if (!consumed.ok && consumed.code !== "already_used" && consumed.code !== "race_conflict") {
      console.warn(LOG, "consume_after_handler | handler succeeded but token not marked used", {
        tokenStatus: consumed.code,
      });
    }
  } catch (error) {
    console.error(LOG, "consume_failed_after_handler", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({
    ok: true,
    outcome: handlerResult.outcome,
    message: handlerResult.message,
    extraNote: handlerResult.extraNote ?? null,
  });
}
