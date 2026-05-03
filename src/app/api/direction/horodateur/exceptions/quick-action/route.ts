import { NextRequest, NextResponse } from "next/server";

import {
  getHorodateurQuickActionActorUserId,
  hashHorodateurQuickActionToken,
} from "@/app/lib/horodateur-exception-quick-action.server";
import { markHorodateurExceptionAppAlertHandled } from "@/app/lib/app-alerts-dual-write.server";
import { approveHorodateurException, refuseHorodateurException } from "@/app/lib/horodateur-v1/service";
import {
  findQuickActionTokenByHash,
  getExceptionById,
  markQuickActionTokenUsed,
} from "@/app/lib/horodateur-v1/repository";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { HorodateurPhase1Error } from "@/app/lib/horodateur-v1/types";

const LOG = "[horodateur-exception-quick-action]";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function quickActionHtmlPage(options: {
  title: string;
  message: string;
  variant: "success" | "warning" | "error";
  extraNote?: string | null;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const openHref = appUrl ? `${appUrl}/direction/horodateur` : "/direction/horodateur";
  const color =
    options.variant === "success"
      ? "#15803d"
      : options.variant === "warning"
        ? "#b45309"
        : "#b91c1c";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 12px;font-size:1.15rem;color:${color};">${escapeHtml(options.title)}</h1>
    <p style="margin:0 0 16px;line-height:1.55;font-size:0.95rem;">${escapeHtml(options.message)}</p>
    ${
      options.extraNote
        ? `<p style="margin:0 0 16px;line-height:1.5;font-size:0.88rem;color:#64748b;">${escapeHtml(options.extraNote)}</p>`
        : ""
    }
    <a href="${escapeHtml(openHref)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:0.9rem;">Ouvrir TAGORA Time</a>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const exceptionId = url.searchParams.get("exceptionId")?.trim() ?? "";
  const actionRaw = url.searchParams.get("action")?.trim().toLowerCase() ?? "";
  const rawToken = url.searchParams.get("token")?.trim() ?? "";

  const respond = (body: string, status = 200) =>
    new NextResponse(body, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  if (
    !exceptionId ||
    !rawToken ||
    (actionRaw !== "approve" && actionRaw !== "reject") ||
    !/^[0-9a-f-]{36}$/i.test(exceptionId)
  ) {
    return respond(
      quickActionHtmlPage({
        title: "Lien invalide",
        message: "Ce lien est incomplet ou mal formé.",
        variant: "error",
      }),
      400
    );
  }

  const action = actionRaw as "approve" | "reject";
  const tokenHash = hashHorodateurQuickActionToken(rawToken);

  let row: Awaited<ReturnType<typeof findQuickActionTokenByHash>>;
  try {
    row = await findQuickActionTokenByHash(tokenHash);
  } catch (error) {
    console.error(LOG, "lookup_failed", {
      exceptionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return respond(
      quickActionHtmlPage({
        title: "Erreur technique",
        message: "Impossible de valider le lien pour le moment.",
        variant: "error",
      }),
      500
    );
  }

  if (!row) {
    return respond(
      quickActionHtmlPage({
        title: "Lien invalide",
        message: "Ce lien de validation n’est pas reconnu.",
        variant: "error",
      }),
      400
    );
  }

  if (row.exception_id !== exceptionId || row.action !== action) {
    return respond(
      quickActionHtmlPage({
        title: "Lien invalide",
        message: "Le lien ne correspond pas à cette action.",
        variant: "error",
      }),
      400
    );
  }

  if (row.used_at) {
    return respond(
      quickActionHtmlPage({
        title: "Lien déjà utilisé",
        message: "Ce lien a déjà été utilisé.",
        variant: "warning",
      }),
      200
    );
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return respond(
      quickActionHtmlPage({
        title: "Lien expiré",
        message:
          "Ce lien d’approbation est expiré. Veuillez ouvrir TAGORA Time pour traiter l’exception.",
        variant: "warning",
      }),
      200
    );
  }

  let exception: Awaited<ReturnType<typeof getExceptionById>>;
  try {
    exception = await getExceptionById(exceptionId);
  } catch (error) {
    console.error(LOG, "exception_load_failed", { exceptionId, error });
    return respond(
      quickActionHtmlPage({
        title: "Erreur technique",
        message: "Impossible de charger l’exception.",
        variant: "error",
      }),
      500
    );
  }

  if (!exception) {
    await markQuickActionTokenUsed(row.id);
    return respond(
      quickActionHtmlPage({
        title: "Exception introuvable",
        message: "Cette exception n’existe plus.",
        variant: "error",
      }),
      404
    );
  }

  if (exception.status !== "en_attente") {
    await markQuickActionTokenUsed(row.id);
    return respond(
      quickActionHtmlPage({
        title: "Déjà traitée",
        message: "Cette exception a déjà été traitée.",
        variant: "warning",
      }),
      200
    );
  }

  const actorId = getHorodateurQuickActionActorUserId();
  if (!actorId) {
    console.error(LOG, "configuration_missing_actor", {
      exceptionId,
      hint: "Set HORODATEUR_QUICK_ACTION_ACTOR_UUID to a real Supabase Auth user UUID (admin or technical account).",
    });
    return respond(
      quickActionHtmlPage({
        title: "Configuration manquante",
        message:
          "Les actions rapides par courriel ou SMS ne sont pas configurées sur ce serveur. Définissez HORODATEUR_QUICK_ACTION_ACTOR_UUID avec un UUID utilisateur Auth Supabase valide (pas le placeholder xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).",
        variant: "error",
      }),
      503
    );
  }

  let notifyNote: string | null = null;

  try {
    if (action === "approve") {
      const result = await approveHorodateurException({
        actorUserId: actorId,
        exceptionId,
        reviewNote: null,
        approvedMinutes: null,
      });
      const marked = await markQuickActionTokenUsed(row.id);
      if (!marked) {
        console.warn(LOG, "token_already_consumed_post_approve", { exceptionId });
      }
      const n = result.employeeNotify;
      if (n && (n.emailStatus === "error" || n.smsStatus === "error")) {
        notifyNote =
          "Exception approuvée, mais la notification employé n’a pas pu être envoyée complètement.";
      }
      try {
        const supabase = createAdminSupabaseClient();
        await markHorodateurExceptionAppAlertHandled(
          supabase,
          exceptionId,
          actorId,
          "approved"
        );
      } catch (markErr) {
        console.warn(LOG, "mark_app_alert_failed", {
          exceptionId,
          message: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      return respond(
        quickActionHtmlPage({
          title: "Exception approuvée",
          message: "Exception approuvée.",
          variant: "success",
          extraNote: notifyNote,
        }),
        200
      );
    }

    const result = await refuseHorodateurException({
      actorUserId: actorId,
      exceptionId,
      reviewNote: "Refusé via lien rapide courriel/SMS.",
    });
    const marked = await markQuickActionTokenUsed(row.id);
    if (!marked) {
      console.warn(LOG, "token_already_consumed_post_refuse", { exceptionId });
    }
    const n = result.employeeNotify;
    if (n && (n.emailStatus === "error" || n.smsStatus === "error")) {
      notifyNote =
        "Exception refusée, mais la notification employé n’a pas pu être envoyée complètement.";
    }
    try {
      const supabase = createAdminSupabaseClient();
      await markHorodateurExceptionAppAlertHandled(supabase, exceptionId, actorId, "rejected");
    } catch (markErr) {
      console.warn(LOG, "mark_app_alert_failed", {
        exceptionId,
        message: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
    return respond(
      quickActionHtmlPage({
        title: "Exception refusée",
        message: "Exception refusée.",
        variant: "success",
        extraNote: notifyNote,
      }),
      200
    );
  } catch (error) {
    const code = error instanceof HorodateurPhase1Error ? error.code : null;
    console.error(LOG, "action_failed", {
      exceptionId,
      action,
      code,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HorodateurPhase1Error && error.code === "exception_already_reviewed") {
      await markQuickActionTokenUsed(row.id);
      return respond(
        quickActionHtmlPage({
          title: "Déjà traitée",
          message: "Cette exception a déjà été traitée.",
          variant: "warning",
        }),
        200
      );
    }

    return respond(
      quickActionHtmlPage({
        title: "Action impossible",
        message:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors du traitement.",
        variant: "error",
      }),
      400
    );
  }
}
