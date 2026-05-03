import "server-only";

import { extractRoleFromUser } from "@/app/lib/account-requests.server";
import { isValidEmail } from "@/app/lib/account-requests.shared";
import {
  createMissingCommunicationTemplateAlert,
  trySendCommunicationDirectionEmail,
  trySendCommunicationDirectionSms,
} from "@/app/lib/communication-templates.server";
import {
  scheduleRequestTypeLabel,
  type EffectifsScheduleRequestType,
} from "@/app/lib/effectifs-schedule-request.shared";
import { buildPublicUrl } from "@/app/lib/email/templates";
import { sendDirectionAlert, sendDirectionSmsAlert } from "@/app/lib/notifications";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const LOG_PREFIX = "[effectifs-schedule-request-notify]";

async function collectDirectionAndAdminEmails(): Promise<string[]> {
  const fromEnv = (process.env.DIRECTION_ALERT_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((e) => isValidEmail(e));

  const emails = new Set<string>(fromEnv);

  const supabase = createAdminSupabaseClient();
  let page = 1;
  const perPage = 200;

  try {
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error(LOG_PREFIX, "list_users_failed", { message: error.message });
        break;
      }
      const users = data?.users ?? [];
      for (const u of users) {
        const r = extractRoleFromUser(u);
        if ((r === "admin" || r === "direction") && u.email && isValidEmail(u.email)) {
          emails.add(u.email.trim().toLowerCase());
        }
      }
      if (users.length < perPage) break;
      page += 1;
    }
  } catch (e) {
    console.error(LOG_PREFIX, "list_users_unexpected", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return Array.from(emails);
}

function formatDateOrPeriod(input: {
  requestType: EffectifsScheduleRequestType;
  requestedDate: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
}): string {
  if (input.requestType === "vacation" && input.requestedStartDate && input.requestedEndDate) {
    return `${input.requestedStartDate} → ${input.requestedEndDate}`;
  }
  if (input.requestedStartDate && input.requestedEndDate) {
    return `${input.requestedStartDate} → ${input.requestedEndDate}`;
  }
  if (input.requestedDate) return input.requestedDate;
  return "—";
}

function formatConcernedHours(input: {
  requestType: EffectifsScheduleRequestType;
  startTime: string | null;
  endTime: string | null;
  isFullDay: boolean;
}): string {
  const st = input.startTime ? input.startTime.trim().slice(0, 5) : null;
  const en = input.endTime ? input.endTime.trim().slice(0, 5) : null;
  if (input.requestType === "vacation") {
    return "Période (vacances)";
  }
  if (st && en) return `${st} – ${en}`;
  if (st) return `À partir de ${st}`;
  if (en) return `Jusqu'à ${en}`;
  if (input.isFullDay) return "Journée entière";
  return "—";
}

export type NewPendingScheduleRequestNotifyInput = {
  requestId: string;
  employeeName: string | null;
  requestType: EffectifsScheduleRequestType;
  requestedDate: string | null;
  requestedStartDate: string | null;
  requestedEndDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isFullDay: boolean;
  reason: string;
};

/**
 * Alerte direction/admin uniquement. Ne bloque jamais la création de la demande.
 */
export async function notifyDirectionNewPendingScheduleRequest(
  input: NewPendingScheduleRequestNotifyInput
): Promise<void> {
  try {
    const recipientEmails = await collectDirectionAndAdminEmails();
    const typeLabel = scheduleRequestTypeLabel(input.requestType);
    const dateOrPeriod = formatDateOrPeriod(input);
    const hoursLine = formatConcernedHours(input);

    const managementPath = "/direction/effectifs?tab=schedule-requests";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    const actionUrl =
      buildPublicUrl(managementPath) ??
      (baseUrl ? `${baseUrl}${managementPath}` : managementPath);

    let admin: ReturnType<typeof createAdminSupabaseClient> | null = null;
    try {
      admin = createAdminSupabaseClient();
    } catch {
      admin = null;
    }

    const templateVars: Record<string, string | undefined> = {
      employee_name: input.employeeName?.trim() || "—",
      request_type: typeLabel,
      request_period: dateOrPeriod,
      request_date: input.requestedDate ?? dateOrPeriod,
      employee_note: input.reason,
      action_url: actionUrl,
      app_url: baseUrl,
      dashboard_url: baseUrl ? `${baseUrl}/direction/effectifs` : "/direction/effectifs",
    };

    const emailTry = await trySendCommunicationDirectionEmail({
      supabase: admin,
      templateKey: "schedule_request_created_direction_email",
      audience: "direction_admin",
      variables: templateVars,
      recipientEmails: recipientEmails.length > 0 ? recipientEmails : undefined,
    });

    let emailResult: Awaited<ReturnType<typeof sendDirectionAlert>>;
    if (emailTry.usedTemplate) {
      emailResult = {
        ok: emailTry.result.ok,
        skipped: emailTry.result.skipped,
        reason: emailTry.result.reason,
        recipients: emailTry.result.recipients,
        invalidRecipients: [],
        providerMessageId: null,
      };
    } else {
      if (admin) {
        await createMissingCommunicationTemplateAlert(
          admin,
          "schedule_request_created_direction_email",
          "email",
          "direction_admin"
        );
      }
      emailResult = await sendDirectionAlert(
        {
          alertType: "effectifs_schedule_request_pending",
          classification: "direction_action_required",
          subject: "Nouvelle demande d’horaire ou d’exception à approuver",
          summary: "Une nouvelle demande est en attente d’approbation.",
          requesterLabel: "Employé",
          requesterName: input.employeeName?.trim() || "—",
          details: {
            "Type de demande": typeLabel,
            "Date ou période": dateOrPeriod,
            "Heures concernées": hoursLine,
            Justification: input.reason,
          },
          managementUrl: managementPath,
          managementLabel: "Voir les demandes d’horaire",
          requestId: input.requestId,
        },
        recipientEmails.length > 0 ? { recipients: recipientEmails } : undefined
      );
    }

    if (!emailResult.ok && !emailResult.skipped) {
      console.error(LOG_PREFIX, "email_delivery_failed", {
        reason: emailResult.reason,
        recipients: emailResult.recipients,
      });
    }

    const smsTry = await trySendCommunicationDirectionSms({
      supabase: admin,
      templateKey: "schedule_request_created_direction_sms",
      audience: "direction_admin",
      variables: templateVars,
    });

    let smsResult: Awaited<ReturnType<typeof sendDirectionSmsAlert>>;
    if (smsTry.usedTemplate) {
      smsResult = smsTry.result;
    } else {
      if (admin) {
        await createMissingCommunicationTemplateAlert(
          admin,
          "schedule_request_created_direction_sms",
          "sms",
          "direction_admin"
        );
      }
      const emp = input.employeeName?.trim() || "Employé";
      smsResult = await sendDirectionSmsAlert({
        body: `TAGORA Time : nouvelle demande d'horaire/exception de ${emp} à approuver.`,
      });
    }

    if (!smsResult.sent && !smsResult.skipped) {
      console.error(LOG_PREFIX, "sms_delivery_failed", {
        reason: smsResult.reason,
        recipients: smsResult.recipients,
      });
    }
  } catch (e) {
    console.error(LOG_PREFIX, "unexpected_error", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
