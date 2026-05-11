import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  countEmployeeLinkedHistory,
  employeeHasHistory,
} from "@/app/lib/employee-account-history.server";
import {
  hasScheduleSnapshotChanged,
  notifyEmployeeScheduleUpdated,
  type EmployeeNotifyChannelStatus,
} from "@/app/lib/employee-schedule-notify.server";
import {
  sanitizeWeeklyScheduleConfig,
  validateWeeklyScheduleForSave,
  type WeeklyScheduleConfig,
} from "@/app/lib/weekly-schedule";

export const dynamic = "force-dynamic";

const ROUTE = "/api/direction/ressources/employes/[id]";

/** Colonnes optionnelles (migrations) : on peut les retirer du PATCH si absentes en base. */
const OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS = [
  "weekly_schedule_config",
  "effectifs_department_key",
  "effectifs_secondary_department_keys",
  "effectifs_primary_location",
  "effectifs_secondary_locations",
  "can_deliver",
  "default_weekly_hours",
  "schedule_active",
] as const;

const EFFECTIFS_COLUMNS_FOR_NULL = new Set([
  "effectifs_department_key",
  "effectifs_secondary_department_keys",
  "effectifs_primary_location",
  "effectifs_secondary_locations",
  "can_deliver",
  "default_weekly_hours",
  "schedule_active",
]);

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logEmployeeProfileSave(
  phase: string,
  employeeId: number,
  payload: Record<string, unknown> | null,
  error: unknown
) {
  const e = error as SupabaseLikeError;
  console.error("[employee-profile-save]", {
    phase,
    route: ROUTE,
    employeeId,
    payloadKeys: payload ? Object.keys(payload) : [],
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

function isUnknownChauffeursColumnError(error: SupabaseLikeError): boolean {
  const code = String(error.code ?? "");
  if (code === "42703" || code === "PGRST204") {
    return true;
  }
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (text.includes("42703")) {
    return true;
  }
  if (!OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS.some((c) => text.includes(c))) {
    return false;
  }
  return (
    text.includes("does not exist") ||
    text.includes("n'existe pas") ||
    text.includes("could not find") ||
    text.includes("unknown column") ||
    (text.includes("colonne") && text.includes("inconnue"))
  );
}

function extractMissingColumnName(error: SupabaseLikeError): string | null {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  let m = text.match(/column\s+\"?([\w_]+)\"?\s+does\s+not\s+exist/i);
  if (m?.[1]) return m[1];
  m = text.match(/['\"]([\w_]+)['\"]\s+column\s+of\s+['\"]chauffeurs['\"]/i);
  if (m?.[1]) return m[1];
  m = text.match(/could not find the ['\"]([\w_]+)['\"] column/i);
  if (m?.[1]) return m[1];
  return null;
}

function stripReadOnlyKeys(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.id;
  delete next.auth_user_id;
  return next;
}

function jsonError(
  status: number,
  error: string,
  extra?: { code?: string; details?: string; hint?: string }
) {
  return NextResponse.json(
    {
      success: false,
      error,
      code: extra?.code,
      details: extra?.details,
      hint: extra?.hint,
    },
    { status }
  );
}

function formatDbErrorForClient(error: SupabaseLikeError): string {
  const col = extractMissingColumnName(error);
  if (col && !OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS.includes(col as (typeof OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS)[number])) {
    return `Colonne manquante dans la base : ${col}`;
  }

  const code = error.code ?? "";
  if (code === "23502") {
    const m = (error.message ?? "").match(/column \"(\w+)\"/i);
    const c = m?.[1];
    if (c === "effectifs_department_key") {
      return "Veuillez sélectionner un département effectifs avant d'enregistrer.";
    }
    if (c && EFFECTIFS_COLUMNS_FOR_NULL.has(c)) {
      return `Configuration effectifs incomplète : ${c}`;
    }
  }

  const msg = (error.message ?? "").trim();
  if (msg) return msg;
  return "Erreur lors de l'enregistrement en base.";
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  let employeeId = 0;
  let payloadForLog: Record<string, unknown> | null = null;

  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return jsonError(401, "Non authentifié.");
    }
    if (role !== "direction" && role !== "admin") {
      return jsonError(403, "Accès refusé.");
    }

    const { id: idParam } = await ctx.params;
    const parsedId = Number.parseInt(idParam, 10);
    if (!Number.isFinite(parsedId)) {
      return jsonError(400, "Identifiant employé invalide.");
    }
    employeeId = parsedId;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      logEmployeeProfileSave("parse_body", employeeId, null, new SyntaxError("Invalid JSON"));
      return jsonError(400, "Corps de requête JSON invalide.");
    }

    payloadForLog = body;

    if ("weekly_schedule_config" in body && body.weekly_schedule_config != null) {
      const raw = body.weekly_schedule_config;
      const sanitized = sanitizeWeeklyScheduleConfig(raw);
      if (!sanitized) {
        const err = { message: "Horaire hebdomadaire invalide.", code: "weekly_invalid" };
        logEmployeeProfileSave("validate_weekly", employeeId, body, err);
        return jsonError(400, "Horaire hebdomadaire invalide.", {
          code: err.code,
          details: typeof raw === "object" ? JSON.stringify(raw).slice(0, 500) : String(raw),
        });
      }
      const weeklyCheck = validateWeeklyScheduleForSave(sanitized as WeeklyScheduleConfig);
      if (!weeklyCheck.ok) {
        logEmployeeProfileSave("validate_weekly", employeeId, body, { message: weeklyCheck.message });
        return jsonError(400, weeklyCheck.message);
      }
      body.weekly_schedule_config = sanitized;
    }

    const primaryDept = body.effectifs_department_key;
    const hasSecondaryDept =
      Array.isArray(body.effectifs_secondary_department_keys) &&
      (body.effectifs_secondary_department_keys as unknown[]).length > 0;
    const hasPrimaryLoc =
      typeof body.effectifs_primary_location === "string" &&
      body.effectifs_primary_location.trim() !== "";
    const hasSecondaryLoc =
      Array.isArray(body.effectifs_secondary_locations) &&
      (body.effectifs_secondary_locations as unknown[]).length > 0;
    if (
      (hasSecondaryDept || hasPrimaryLoc || hasSecondaryLoc) &&
      (primaryDept == null || primaryDept === "")
    ) {
      const err = {
        message:
          "Veuillez sélectionner un département effectifs avant d'enregistrer, ou retirez les emplacements / départements secondaires.",
        code: "effectifs_incomplete",
      };
      logEmployeeProfileSave("validate_effectifs", employeeId, body, err);
      return jsonError(400, err.message, { code: err.code });
    }

    let updatePayload = stripReadOnlyKeys(body);
    const supabase = createAdminSupabaseClient();

    const { data: beforeRow } = await supabase
      .from("chauffeurs")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();

    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { data, error } = await supabase
        .from("chauffeurs")
        .update(updatePayload)
        .eq("id", employeeId)
        .select("*")
        .single();

      if (!error) {
        const scheduleChanged = hasScheduleSnapshotChanged(
          beforeRow as Record<string, unknown> | null,
          data as Record<string, unknown>
        );

        type ScheduleNotificationPayload = {
          scheduleChanged: boolean;
          emailStatus?: EmployeeNotifyChannelStatus;
          smsStatus?: EmployeeNotifyChannelStatus;
        };

        let scheduleNotification: ScheduleNotificationPayload = { scheduleChanged: false };

        if (scheduleChanged) {
          try {
            const r = await notifyEmployeeScheduleUpdated({
              employeeId,
              nom: typeof data.nom === "string" ? data.nom : null,
              email: typeof data.courriel === "string" ? data.courriel : null,
              phone: typeof data.telephone === "string" ? data.telephone : null,
            });
            scheduleNotification = {
              scheduleChanged: true,
              emailStatus: r.emailStatus,
              smsStatus: r.smsStatus,
            };
          } catch (notifyErr) {
            const e = notifyErr as { message?: string; code?: string; details?: string; hint?: string };
            console.error("[employee-schedule-notify]", "notify_unexpected", {
              employeeId,
              email: typeof data.courriel === "string" ? data.courriel : null,
              phone: data.telephone ? "[redacted]" : null,
              scheduleChanged: true,
              emailStatus: "failed" as const,
              smsStatus: "failed" as const,
              message: e?.message,
              code: e?.code,
              details: e?.details,
              hint: e?.hint,
            });
            scheduleNotification = {
              scheduleChanged: true,
              emailStatus: "failed",
              smsStatus: "failed",
            };
          }
        }

        return NextResponse.json({ success: true, profile: data, scheduleNotification });
      }

      if (isUnknownChauffeursColumnError(error)) {
        const missingCol = extractMissingColumnName(error);
        if (
          missingCol &&
          OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS.includes(
            missingCol as (typeof OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS)[number]
          ) &&
          missingCol in updatePayload
        ) {
          logEmployeeProfileSave("db_update_retry_drop_column", employeeId, updatePayload, error);
          const nextPayload = { ...updatePayload } as Record<string, unknown>;
          delete nextPayload[missingCol];
          updatePayload = nextPayload;
          continue;
        }
        if (missingCol) {
          logEmployeeProfileSave("db_update", employeeId, updatePayload, error);
          const msg = `Colonne manquante dans la base : ${missingCol}`;
          return jsonError(500, msg, {
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
        }
        let dropped = false;
        for (const c of OPTIONAL_CHAUFFEUR_PROFILE_COLUMNS) {
          if (c in updatePayload) {
            logEmployeeProfileSave("db_update_retry_drop_optional", employeeId, updatePayload, error);
            const nextPayload = { ...updatePayload } as Record<string, unknown>;
            delete nextPayload[c];
            updatePayload = nextPayload;
            dropped = true;
            break;
          }
        }
        if (dropped) continue;
      }

      logEmployeeProfileSave("db_update", employeeId, updatePayload, error);
      const userMsg = formatDbErrorForClient(error);
      return jsonError(500, userMsg, {
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }

    logEmployeeProfileSave("db_update", employeeId, updatePayload, new Error("max_retries"));
    return jsonError(500, "Impossible d'enregistrer après plusieurs tentatives.");
  } catch (error) {
    logEmployeeProfileSave("unexpected", employeeId, payloadForLog, error);
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Erreur inattendue lors de l'enregistrement.";
    return jsonError(500, msg);
  }
}

/**
 * Suppression : si l'employé a un historique opérationnel, désactivation (soft) uniquement.
 * Sinon suppression de la ligne chauffeurs. Ne supprime pas l'utilisateur Auth (hors scope).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user) {
      return jsonError(401, "Non authentifié.");
    }
    if (role !== "direction" && role !== "admin") {
      return jsonError(403, "Accès refusé.");
    }

    const { id: idParam } = await ctx.params;
    const employeeId = Number.parseInt(idParam, 10);
    if (!Number.isFinite(employeeId)) {
      return jsonError(400, "Identifiant employé invalide.");
    }

    const supabase = createAdminSupabaseClient();

    const { data: row } = await supabase
      .from("chauffeurs")
      .select("id")
      .eq("id", employeeId)
      .maybeSingle();

    if (!row) {
      return jsonError(404, "Employé introuvable.");
    }

    const { total } = await countEmployeeLinkedHistory(supabase, employeeId);

    async function softDeactivate(): Promise<{ ok: boolean; error?: string }> {
      let { error } = await supabase
        .from("chauffeurs")
        .update({ actif: false, schedule_active: false })
        .eq("id", employeeId);
      if (error?.message?.includes("schedule_active")) {
        ({ error } = await supabase.from("chauffeurs").update({ actif: false }).eq("id", employeeId));
      }
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    }

    if (employeeHasHistory(total)) {
      const r = await softDeactivate();
      if (!r.ok) {
        console.error("[employee-delete-soft]", r.error);
        return jsonError(500, r.error ?? "Désactivation impossible.");
      }
      return NextResponse.json({
        success: true,
        softDeleted: true,
        message:
          "Ce compte possède un historique. Il a été désactivé au lieu d'être supprimé.",
      });
    }

    const { error: delErr } = await supabase.from("chauffeurs").delete().eq("id", employeeId);

    if (delErr) {
      if (delErr.code === "23503") {
        const r = await softDeactivate();
        if (!r.ok) {
          return jsonError(500, r.error ?? "Impossible de supprimer ou désactiver.");
        }
        return NextResponse.json({
          success: true,
          softDeleted: true,
          message:
            "Ce compte possède un historique. Il a été désactivé au lieu d'être supprimé.",
        });
      }
      console.error("[employee-delete]", delErr);
      return jsonError(500, delErr.message ?? "Suppression impossible.");
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      message: "Compte supprimé.",
    });
  } catch (e) {
    console.error("[employee-delete]", e);
    return jsonError(500, e instanceof Error ? e.message : "Erreur inattendue.");
  }
}
