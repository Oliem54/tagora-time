import "server-only";

import { markHorodateurExceptionAppAlertHandled } from "@/app/lib/app-alerts-dual-write.server";
import {
  APP_ACTION_TYPES,
  APP_ACTION_TARGET_TYPES,
  type AppActionResponse,
} from "@/app/lib/app-action-tokens.shared";
import type { AppActionTokenRow } from "@/app/lib/app-action-tokens.server";
import { getHorodateurQuickActionActorUserId } from "@/app/lib/horodateur-exception-quick-action.server";
import { getExceptionById } from "@/app/lib/horodateur-v1/repository";
import {
  approveHorodateurException,
  refuseHorodateurException,
} from "@/app/lib/horodateur-v1/service";
import { HorodateurPhase1Error } from "@/app/lib/horodateur-v1/types";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const LOG = "[app-action-handlers]";

export type AppActionHandlerResult =
  | {
      ok: true;
      outcome: "accepted" | "rejected";
      message: string;
      extraNote?: string | null;
    }
  | {
      ok: false;
      code:
        | "unsupported_action"
        | "target_not_found"
        | "already_handled"
        | "configuration_missing"
        | "handler_error";
      message: string;
    };

export async function isHorodateurExceptionPending(
  exceptionId: string
): Promise<boolean> {
  const exception = await getExceptionById(exceptionId);
  return Boolean(exception && exception.status === "en_attente");
}

export async function executeAppActionHandler(options: {
  row: AppActionTokenRow;
  response: AppActionResponse;
  responseNote?: string | null;
}): Promise<AppActionHandlerResult> {
  if (
    options.row.action_type === APP_ACTION_TYPES.horodateurExceptionReview &&
    options.row.target_type === APP_ACTION_TARGET_TYPES.horodateurException
  ) {
    return executeHorodateurExceptionReviewHandler(options);
  }

  return {
    ok: false,
    code: "unsupported_action",
    message: "Ce type d'action n'est pas pris en charge.",
  };
}

async function executeHorodateurExceptionReviewHandler(options: {
  row: AppActionTokenRow;
  response: AppActionResponse;
  responseNote?: string | null;
}): Promise<AppActionHandlerResult> {
  const exceptionId = options.row.target_id;
  const actorId = getHorodateurQuickActionActorUserId();

  if (!actorId) {
    console.error(LOG, "configuration_missing_actor", {
      exceptionId,
      hint: "Set HORODATEUR_QUICK_ACTION_ACTOR_UUID to a valid Supabase Auth user UUID.",
    });
    return {
      ok: false,
      code: "configuration_missing",
      message:
        "Les actions rapides ne sont pas configurees sur ce serveur. Contactez la direction.",
    };
  }

  let exception: Awaited<ReturnType<typeof getExceptionById>>;
  try {
    exception = await getExceptionById(exceptionId);
  } catch (error) {
    console.error(LOG, "exception_load_failed", {
      exceptionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      code: "handler_error",
      message: "Impossible de charger la demande horodateur.",
    };
  }

  if (!exception) {
    return {
      ok: false,
      code: "target_not_found",
      message: "Cette exception n'existe plus.",
    };
  }

  if (exception.status !== "en_attente") {
    return {
      ok: false,
      code: "already_handled",
      message: "Cette demande a deja ete traitee.",
    };
  }

  let notifyNote: string | null = null;

  try {
    if (options.response === "accept") {
      const result = await approveHorodateurException({
        actorUserId: actorId,
        exceptionId,
        reviewNote: null,
        approvedMinutes: null,
      });
      const n = result.employeeNotify;
      if (n && (n.emailStatus === "error" || n.smsStatus === "error")) {
        notifyNote =
          "Demande acceptee, mais la notification employe n'a pas pu etre envoyee completement.";
      }
    } else {
      const result = await refuseHorodateurException({
        actorUserId: actorId,
        exceptionId,
        reviewNote: options.responseNote?.trim() ?? "",
      });
      const n = result.employeeNotify;
      if (n && (n.emailStatus === "error" || n.smsStatus === "error")) {
        notifyNote =
          "Demande refusee, mais la notification employe n'a pas pu etre envoyee completement.";
      }
    }

    try {
      const supabase = createAdminSupabaseClient();
      await markHorodateurExceptionAppAlertHandled(
        supabase,
        exceptionId,
        actorId,
        options.response === "accept" ? "approved" : "rejected"
      );
    } catch (markErr) {
      console.warn(LOG, "mark_app_alert_failed", {
        exceptionId,
        message: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }

    return {
      ok: true,
      outcome: options.response === "accept" ? "accepted" : "rejected",
      message:
        options.response === "accept"
          ? "Demande acceptee. Votre decision a ete enregistree."
          : "Demande refusee. Votre decision a ete enregistree.",
      extraNote: notifyNote,
    };
  } catch (error) {
    const code = error instanceof HorodateurPhase1Error ? error.code : null;
    console.error(LOG, "horodateur_handler_failed", {
      exceptionId,
      response: options.response,
      code,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HorodateurPhase1Error && error.code === "exception_already_reviewed") {
      return {
        ok: false,
        code: "already_handled",
        message: "Cette demande a deja ete traitee.",
      };
    }

    return {
      ok: false,
      code: "handler_error",
      message:
        error instanceof Error
          ? error.message
          : "Une erreur est survenue lors du traitement.",
    };
  }
}
