import { NextRequest, NextResponse } from "next/server";
import { listDirectionLiveBoard } from "@/app/lib/horodateur-v1/service";
import { requireDirectionHorodateurAccess } from "@/app/api/horodateur/_shared";
import { devInfo, logError } from "@/app/lib/logger";

export async function GET(req: NextRequest) {
  try {
    devInfo("horodateur-live", "start auth check", {
      route: "/api/direction/horodateur/live",
      method: req.method,
    });

    const auth = await requireDirectionHorodateurAccess(req);

    if (!auth.ok) {
      return auth.response;
    }

    devInfo("horodateur-live", "start board load", {
      route: "/api/direction/horodateur/live",
      userId: auth.user.id,
    });

    const board = await listDirectionLiveBoard();

    devInfo("horodateur-live", "success response", {
      route: "/api/direction/horodateur/live",
      boardCount: Array.isArray(board) ? board.length : 0,
    });

    return NextResponse.json({
      success: true,
      board: Array.isArray(board) ? board : [],
      ...(process.env.NODE_ENV !== "production"
        ? {
            debug: auth.debug,
          }
        : {}),
    });
  } catch (error) {
    const isDev = process.env.NODE_ENV !== "production";
    const errorLike =
      error && typeof error === "object"
        ? (error as {
            message?: unknown;
            code?: unknown;
            details?: unknown;
            hint?: unknown;
            stack?: unknown;
          })
        : null;

    const message =
      error instanceof Error
        ? error.message
        : typeof errorLike?.message === "string" && errorLike.message.trim()
          ? errorLike.message
          : "Erreur serveur horodateur live.";
    const code =
      typeof errorLike?.code === "string" && errorLike.code.trim()
        ? errorLike.code
        : null;
    const details =
      typeof errorLike?.details === "string" && errorLike.details.trim()
        ? errorLike.details
        : null;
    const hint =
      typeof errorLike?.hint === "string" && errorLike.hint.trim()
        ? errorLike.hint
        : null;
    const stack =
      error instanceof Error
        ? error.stack ?? null
        : typeof errorLike?.stack === "string" && errorLike.stack.trim()
          ? errorLike.stack
          : null;

    logError("horodateur-live", "route failure", {
      route: "/api/direction/horodateur/live",
      message,
      code,
      details,
      hint,
      stack,
      raw: error,
    });

    return NextResponse.json(
      {
        ok: false,
        route: "/api/direction/horodateur/live",
        error: message,
        code,
        details,
        hint,
        ...(isDev && stack ? { stack } : {}),
      },
      { status: 500 }
    );
  }
}
