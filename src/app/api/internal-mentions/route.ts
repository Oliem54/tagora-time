import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildPublicUrl,
  renderBaseEmailLayout,
  renderInfoRows,
  renderPlainTextFallback,
  type EmailInfoRow,
} from "@/app/lib/email/templates";

type MentionEntityType =
  | "livraison"
  | "ramassage"
  | "blocage_journee"
  | "blocage_vehicule"
  | "blocage_remorque";

type MentionStatus = "envoye" | "lu" | "erreur_email" | "aucun_courriel";

type MentionInsertRow = {
  entity_type: MentionEntityType;
  entity_id: string;
  mentioned_user_id: string | null;
  mentioned_employee_id: number | null;
  mentioned_name: string | null;
  mentioned_email: string | null;
  message: string;
  created_by_user_id: string;
  created_by_name: string | null;
  created_by_email: string | null;
  email_sent: boolean;
  email_sent_at: string | null;
  email_error: string | null;
  status: MentionStatus;
};

type SelectedRecipientInput = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  roleLabel?: unknown;
};

type ResolvedRecipient = {
  userId: string | null;
  employeeId: number | null;
  recipientId: string;
  name: string | null;
  email: string | null;
  roleLabel: string | null;
};

function parseEntityType(value: unknown): MentionEntityType | null {
  if (
    value === "livraison" ||
    value === "ramassage" ||
    value === "blocage_journee" ||
    value === "blocage_vehicule" ||
    value === "blocage_remorque"
  ) {
    return value;
  }
  return null;
}

function normalizeRole(value: unknown) {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "direction" || role === "manager") return "direction";
  if (role === "employe" || role === "employee" || role === "chauffeur") return "employe";
  return null;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

function getSubject(entityType: MentionEntityType, contextTitle?: string | null) {
  const suffix = contextTitle?.trim() ? ` : ${contextTitle.trim()}` : "";
  if (entityType === "livraison") return `TAGORA - Nouvel avis interne sur une livraison${suffix}`;
  if (entityType === "ramassage") return `TAGORA - Nouvel avis interne sur un ramassage${suffix}`;
  if (entityType === "blocage_journee") return `TAGORA - Nouvel avis interne sur une journee${suffix}`;
  if (entityType === "blocage_vehicule") return `TAGORA - Nouvel avis interne sur un vehicule${suffix}`;
  return `TAGORA - Nouvel avis interne sur une remorque${suffix}`;
}

function getContextLabel(entityType: MentionEntityType) {
  if (entityType === "livraison") return "Livraison";
  if (entityType === "ramassage") return "Ramassage";
  if (entityType === "blocage_journee") return "Blocage journee";
  if (entityType === "blocage_vehicule") return "Blocage vehicule";
  return "Blocage remorque";
}

async function sendMentionEmail(options: {
  operationId?: string;
  to: string;
  subject: string;
  message: string;
  recipientName: string;
  senderName: string;
  entityType: MentionEntityType;
  recipientsLabel?: string | null;
  senderEmail?: string | null;
  context?: {
    title?: string;
    client?: string;
    adresse?: string;
    date?: string;
    heure?: string;
    statut?: string;
    dossier?: string;
    commande?: string;
    facture?: string;
    vehicule?: string;
    remorque?: string;
    chauffeur?: string;
    linkPath?: string;
  };
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? process.env.DIRECTION_ALERT_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      reason: "resend_not_configured" as const,
      providerMessageId: null,
      providerResponse: null as unknown,
      requestPayload: null as unknown,
    };
  }
  if (/onboarding@resend\.dev|test@test\.com/i.test(fromEmail)) {
    console.warn("[internal-mentions send] from_email_warning", {
      operationId: options.operationId ?? null,
      fromEmail,
    });
  }

  const link = buildPublicUrl(options.context?.linkPath);
  const contextLabel = getContextLabel(options.entityType);
  const subjectTitle =
    options.entityType === "livraison"
      ? "TAGORA - Nouvel avis interne sur une livraison"
      : options.entityType === "ramassage"
        ? "TAGORA - Nouvel avis interne sur un ramassage"
        : "TAGORA - Nouvel avis interne";

  const safe = (value: string | null | undefined) => (value && value.trim() ? value.trim() : "-");
  const infoRows: EmailInfoRow[] = [
    { label: "Contexte", value: contextLabel },
    { label: "Client", value: safe(options.context?.client) },
    { label: "Adresse", value: safe(options.context?.adresse) },
    { label: "Date", value: safe(options.context?.date) },
    { label: "Heure prevue", value: safe(options.context?.heure) },
    { label: "Statut", value: safe(options.context?.statut) },
    { label: "Dossier", value: safe(options.context?.dossier) },
    { label: "Commande", value: safe(options.context?.commande) },
    { label: "Facture", value: safe(options.context?.facture) },
    { label: "Vehicule", value: safe(options.context?.vehicule) },
    { label: "Remorque", value: safe(options.context?.remorque) },
    { label: "Chauffeur", value: safe(options.context?.chauffeur) },
    { label: "Auteur", value: safe(options.senderName) },
    { label: "Courriel auteur", value: safe(options.senderEmail) },
    { label: "Destinataires vises", value: safe(options.recipientsLabel) },
  ];
  const text = renderPlainTextFallback({
    greeting: `Bonjour ${options.recipientName || "collegue"},`,
    intro: "Un nouvel avis interne a ete ajoute dans TAGORA.",
    rows: infoRows,
    messageLabel: "Message",
    messageBody: options.message,
    actionUrl: link,
    footer: "Merci,\nTAGORA",
  });
  const html = renderBaseEmailLayout({
    title: subjectTitle,
    intro: `Bonjour ${options.recipientName || "collegue"}, un nouvel avis interne a ete ajoute dans TAGORA.`,
    summaryRowsHtml: renderInfoRows(infoRows),
    messageLabel: "Message",
    messageBody: options.message,
    actionLabel: "Ouvrir dans TAGORA",
    actionUrl: link,
    footer: "Merci,\nTAGORA",
  });

  const resendPayload = {
    from: fromEmail,
    to: [options.to],
    subject: options.subject || subjectTitle,
    html,
    text,
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...resendPayload,
    }),
  });
  const rawBody = await response.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsedBody = rawBody;
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `resend_failed:${rawBody}` as const,
      providerMessageId: null,
      providerResponse: parsedBody,
      requestPayload: resendPayload,
    };
  }
  const providerMessageId =
    parsedBody && typeof parsedBody === "object" && "id" in (parsedBody as Record<string, unknown>)
      ? String((parsedBody as Record<string, unknown>).id ?? "")
      : null;
  return {
    ok: true as const,
    reason: null,
    providerMessageId,
    providerResponse: parsedBody,
    requestPayload: resendPayload,
  };
}

async function listDirectionRecipients() {
  const supabase = createAdminSupabaseClient();
  const recipients: Array<{ userId: string; name: string | null; email: string | null }> = [];
  let page = 1;
  const perPage = 500;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    for (const user of users) {
      const role = normalizeRole(user.app_metadata?.role ?? user.user_metadata?.role);
      if (role === "admin" || role === "direction") {
        recipients.push({
          userId: user.id,
          name:
            (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
            (typeof user.app_metadata?.full_name === "string" && user.app_metadata.full_name) ||
            null,
          email: user.email ?? null,
        });
      }
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return recipients;
}

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || !role) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const url = new URL(req.url);
    const entityType = parseEntityType(url.searchParams.get("entityType"));
    const entityId = String(url.searchParams.get("entityId") ?? "").trim();
    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType et entityId sont requis." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    let query = supabase
      .from("internal_mentions")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (role === "employe") {
      query = query.or(`mentioned_user_id.eq.${user.id},created_by_user_id.eq.${user.id}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur internal-mentions GET." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const operationId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `mention_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { user, role } = await getAuthenticatedRequestUser(req);
    if (!user || !role) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "direction" && role !== "admin") {
      return NextResponse.json({ error: "Acces reserve direction/admin." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      entityType?: unknown;
      entityId?: unknown;
      message?: unknown;
      mentionedEmployeeId?: unknown;
      mentionedEmployeeIds?: unknown;
      recipientIds?: unknown;
      selectedRecipientsForSend?: unknown;
      recipientGroup?: unknown;
      context?: {
        title?: string;
        client?: string;
        adresse?: string;
        date?: string;
        heure?: string;
        statut?: string;
        dossier?: string;
        commande?: string;
        facture?: string;
        vehicule?: string;
        remorque?: string;
        chauffeur?: string;
        linkPath?: string;
      };
    };

    const entityType = parseEntityType(body.entityType);
    const entityId = String(body.entityId ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!entityType || !entityId || !message) {
      return NextResponse.json({ error: "entityType, entityId et message sont requis." }, { status: 400 });
    }

    const senderName =
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      (typeof user.app_metadata?.full_name === "string" && user.app_metadata.full_name) ||
      user.email ||
      user.id;

    const selectedRecipientIds = Array.from(
      new Set(
        [
          ...(Array.isArray(body.recipientIds) ? body.recipientIds : []),
          ...(Array.isArray(body.mentionedEmployeeIds) ? body.mentionedEmployeeIds : []),
          body.mentionedEmployeeId,
        ]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
    const selectedRecipientsRaw = (Array.isArray(body.selectedRecipientsForSend)
      ? body.selectedRecipientsForSend
      : []) as SelectedRecipientInput[];
    console.info("[internal-mentions send] operation", {
      operationId,
      authorUserId: user.id,
      authorEmail: user.email ?? null,
      role,
    });
    console.info("[internal-mentions send] selected recipient ids:", selectedRecipientIds);
    console.info("[internal-mentions send] selected recipients raw:", selectedRecipientsRaw);

    const supabase = createAdminSupabaseClient();
    const recipients: ResolvedRecipient[] = [];
    const numericRecipientIds = selectedRecipientIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (numericRecipientIds.length > 0) {
      const { data: employees, error: employeeError } = await supabase
        .from("chauffeurs")
        .select("id, auth_user_id, nom, courriel")
        .in("id", numericRecipientIds);
      if (employeeError) {
        return NextResponse.json({ error: employeeError.message }, { status: 400 });
      }
      for (const row of employees ?? []) {
        recipients.push({
          recipientId: String(row.id),
          userId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
          employeeId: Number(row.id),
          name: typeof row.nom === "string" ? row.nom : null,
          email: normalizeEmail(row.courriel),
          roleLabel: "Employe",
        });
      }
    }

    const accountRequestIdValues = selectedRecipientIds;
    if (accountRequestIdValues.length > 0) {
      const accountRequestRows: Array<Record<string, unknown>> = [];
      const [byInvited, byId] = await Promise.all([
        supabase
          .from("account_requests")
          .select("id, invited_user_id, full_name, email, assigned_role, requested_role, status")
          .in("invited_user_id", accountRequestIdValues)
          .limit(200),
        supabase
          .from("account_requests")
          .select("id, invited_user_id, full_name, email, assigned_role, requested_role, status")
          .in("id", accountRequestIdValues)
          .limit(200),
      ]);
      if (byInvited.data) accountRequestRows.push(...(byInvited.data as Array<Record<string, unknown>>));
      if (byId.data) accountRequestRows.push(...(byId.data as Array<Record<string, unknown>>));
      for (const row of accountRequestRows) {
        const recipientId =
          (typeof row.invited_user_id === "string" && row.invited_user_id) ||
          (typeof row.id === "string" ? row.id : "");
        if (!recipientId) continue;
        recipients.push({
          recipientId,
          userId: typeof row.invited_user_id === "string" ? row.invited_user_id : null,
          employeeId: null,
          name: typeof row.full_name === "string" ? row.full_name : null,
          email: normalizeEmail(row.email),
          roleLabel:
            (typeof row.assigned_role === "string" && row.assigned_role) ||
            (typeof row.requested_role === "string" && row.requested_role) ||
            null,
        });
      }
    }

    for (const row of selectedRecipientsRaw) {
      const recipientId = String(row.id ?? "").trim();
      if (!recipientId) continue;
      const numericId = Number(recipientId);
      recipients.push({
        recipientId,
        userId: Number.isFinite(numericId) ? null : recipientId,
        employeeId: Number.isFinite(numericId) ? numericId : null,
        name: typeof row.name === "string" ? row.name.trim() : null,
        email: normalizeEmail(row.email),
        roleLabel: typeof row.roleLabel === "string" ? row.roleLabel.trim() : null,
      });
    }

    if (body.recipientGroup === "direction" || body.recipientGroup === "direction_admin") {
      const directionRecipients = await listDirectionRecipients();
      for (const row of directionRecipients) {
        recipients.push({
          recipientId: row.userId,
          userId: row.userId,
          employeeId: null,
          name: row.name,
          email: normalizeEmail(row.email),
          roleLabel: "Direction",
        });
      }
    }

    const uniqueRecipients = Array.from(new Map(
      recipients
        .filter((item) => item.userId || item.employeeId || item.email)
        .map((item) => {
          const key =
            item.userId
              ? `u:${item.userId}`
              : item.employeeId
                ? `e:${item.employeeId}`
                : `m:${item.email}`;
          return [key, item] as const;
        })
    ).values());
    console.info("[internal-mentions send] resolved recipients with emails:", uniqueRecipients);

    if (uniqueRecipients.length === 0) {
      return NextResponse.json({ error: "Aucun destinataire valide selectionne." }, { status: 400 });
    }

    const subject = getSubject(entityType, body.context?.title ?? body.context?.client ?? null);
    const rowsToInsert: MentionInsertRow[] = [];
    const recipientsLabel = uniqueRecipients
      .map((item) => item.name || item.email || item.recipientId)
      .filter(Boolean)
      .join(", ");
    const emailByRecipientKey = new Map<string, string>();
    const emailsSkippedInvalid: string[] = [];
    for (const recipient of uniqueRecipients) {
      if (!recipient.email) {
        emailsSkippedInvalid.push(recipient.recipientId);
        continue;
      }
      emailByRecipientKey.set(recipient.recipientId, recipient.email);
    }
    const emailsToNotify = Array.from(new Set(Array.from(emailByRecipientKey.values())));
    console.info("[internal-mentions send] emails valid:", Array.from(emailByRecipientKey.entries()));
    console.info("[internal-mentions send] emails skipped invalid or missing:", emailsSkippedInvalid);
    console.info("[internal-mentions send] emails to notify:", emailsToNotify);

    if (emailsToNotify.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire avec courriel valide." },
        { status: 400 }
      );
    }

    const emailSendStatus = new Map<string, { ok: boolean; reason: string | null }>();
    for (const email of emailsToNotify) {
      const sendResult = await sendMentionEmail({
        operationId,
        to: email,
        subject,
        message,
        recipientName: uniqueRecipients.find((item) => item.email === email)?.name || email,
        senderName,
        senderEmail: user.email ?? null,
        recipientsLabel,
        entityType,
        context: body.context,
      });
      console.info("[internal-mentions send] resend request payload", {
        operationId,
        to: email,
        payload: sendResult.requestPayload,
      });
      console.info("[internal-mentions send] resend response", {
        operationId,
        to: email,
        ok: sendResult.ok,
        reason: sendResult.reason,
        providerMessageId: sendResult.providerMessageId ?? null,
        providerResponse: sendResult.providerResponse ?? null,
      });
      emailSendStatus.set(email, {
        ok: sendResult.ok,
        reason: sendResult.ok ? null : sendResult.reason,
      });
    }
    console.info("[internal-mentions send] emails sent count:", emailsToNotify.length);

    for (const recipient of uniqueRecipients) {
      let emailSent = false;
      let emailSentAt: string | null = null;
      let emailError: string | null = null;
      let status: MentionStatus = "envoye";

      if (!recipient.email) {
        status = "aucun_courriel";
        emailError = "recipient_email_missing";
      } else {
        const sendStatus = emailSendStatus.get(recipient.email);
        if (!sendStatus || !sendStatus.ok) {
          status = sendStatus?.reason === "resend_not_configured" ? "aucun_courriel" : "erreur_email";
          emailError = sendStatus?.reason ?? "send_failed";
        } else {
          emailSent = true;
          emailSentAt = new Date().toISOString();
          status = "envoye";
        }
      }

      rowsToInsert.push({
        entity_type: entityType,
        entity_id: entityId,
        mentioned_user_id: recipient.userId,
        mentioned_employee_id: recipient.employeeId,
        mentioned_name: recipient.name,
        mentioned_email: recipient.email,
        message,
        created_by_user_id: user.id,
        created_by_name: senderName,
        created_by_email: user.email ?? null,
        email_sent: emailSent,
        email_sent_at: emailSentAt,
        email_error: emailError,
        status,
      });
    }

    const { data, error } = await supabase.from("internal_mentions").insert(rowsToInsert).select("*");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const emailFailures = rowsToInsert.filter((row) => row.status === "erreur_email" || row.status === "aucun_courriel").length;
    const messageInfo =
      emailFailures > 0
        ? "La note a ete enregistree, mais au moins un courriel n a pas pu etre envoye."
        : "Mention interne envoyee.";

    return NextResponse.json({
      success: true,
      message: messageInfo,
      items: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur internal-mentions POST." },
      { status: 500 }
    );
  }
}
