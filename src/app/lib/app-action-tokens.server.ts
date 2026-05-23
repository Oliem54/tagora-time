import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  type AppActionResponse,
  type AppActionTokenMetadata,
  type AppActionTokenPageView,
  type AppActionTokenStatus,
  isValidAppActionRawToken,
} from "@/app/lib/app-action-tokens.shared";
import { resolvePublicAppBaseUrl } from "@/app/lib/horodateur-exception-quick-action.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type AppActionTokenRow = {
  id: string;
  token_hash: string;
  action_type: string;
  module: string;
  target_type: string;
  target_id: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_role: string | null;
  status: AppActionTokenStatus;
  expires_at: string;
  used_at: string | null;
  responded_at: string | null;
  response: AppActionResponse | null;
  response_note: string | null;
  metadata: AppActionTokenMetadata;
  created_by: string | null;
  created_at: string;
  responder_ip: string | null;
  responder_user_agent: string | null;
};

export function hashAppActionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateAppActionRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseMetadata(raw: unknown): AppActionTokenMetadata {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const detailRows = Array.isArray(source.detailRows)
    ? source.detailRows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const label = typeof item.label === "string" ? item.label : "";
          const value = typeof item.value === "string" ? item.value : String(item.value ?? "-");
          if (!label.trim()) return null;
          return { label, value };
        })
        .filter((row): row is { label: string; value: string } => row !== null)
    : [];

  return {
    title: typeof source.title === "string" ? source.title : undefined,
    summary: typeof source.summary === "string" ? source.summary : undefined,
    detailRows,
    managementUrl:
      typeof source.managementUrl === "string" ? source.managementUrl : undefined,
    managementLabel:
      typeof source.managementLabel === "string" ? source.managementLabel : undefined,
  };
}

function formatExpiresAtLabel(expiresAtIso: string): string {
  const date = new Date(expiresAtIso);
  if (!Number.isFinite(date.getTime())) {
    return expiresAtIso;
  }
  return date.toLocaleString("fr-CA", {
    timeZone: "America/Toronto",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function isExpiredRow(row: AppActionTokenRow): boolean {
  const expiresAt = new Date(row.expires_at).getTime();
  return !Number.isFinite(expiresAt) || Date.now() > expiresAt;
}

export async function cancelPendingAppActionTokensForTarget(input: {
  module: string;
  targetType: string;
  targetId: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("app_action_tokens")
    .update({ status: "cancelled" })
    .eq("module", input.module)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }
}

export async function issueAppActionToken(input: {
  actionType: string;
  module: string;
  targetType: string;
  targetId: string;
  metadata: AppActionTokenMetadata;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientRole?: string | null;
  createdBy?: string | null;
  ttlMs?: number;
}): Promise<{ rawToken: string; respondUrl: string; tokenId: string } | null> {
  const baseUrl = resolvePublicAppBaseUrl();
  if (!baseUrl) {
    return null;
  }

  await cancelPendingAppActionTokensForTarget({
    module: input.module,
    targetType: input.targetType,
    targetId: input.targetId,
  });

  const rawToken = generateAppActionRawToken();
  const tokenHash = hashAppActionToken(rawToken);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString();

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("app_action_tokens")
    .insert({
      token_hash: tokenHash,
      action_type: input.actionType,
      module: input.module,
      target_type: input.targetType,
      target_id: input.targetId,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_email: input.recipientEmail?.trim() || null,
      recipient_phone: input.recipientPhone?.trim() || null,
      recipient_role: input.recipientRole ?? null,
      status: "pending",
      expires_at: expiresAt,
      metadata: input.metadata,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return {
    rawToken,
    respondUrl: `${baseUrl}/action/${encodeURIComponent(rawToken)}`,
    tokenId: data.id,
  };
}

export async function findAppActionTokenByRawToken(
  rawToken: string
): Promise<AppActionTokenRow | null> {
  if (!isValidAppActionRawToken(rawToken)) {
    return null;
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("app_action_tokens")
    .select("*")
    .eq("token_hash", hashAppActionToken(rawToken.trim()))
    .maybeSingle<AppActionTokenRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    metadata: parseMetadata(data.metadata),
  };
}

export async function markAppActionTokenExpired(tokenId: string) {
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("app_action_tokens")
    .update({ status: "expired" })
    .eq("id", tokenId)
    .eq("status", "pending");
}

export async function consumeAppActionToken(input: {
  rawToken: string;
  response: AppActionResponse;
  responseNote?: string | null;
  responderIp?: string | null;
  responderUserAgent?: string | null;
}): Promise<
  | { ok: true; row: AppActionTokenRow }
  | {
      ok: false;
      code:
        | "invalid_token"
        | "already_used"
        | "expired"
        | "cancelled"
        | "missing_reject_note"
        | "race_conflict";
      row?: AppActionTokenRow | null;
    }
> {
  const row = await findAppActionTokenByRawToken(input.rawToken);
  if (!row) {
    return { ok: false, code: "invalid_token", row: null };
  }

  if (row.status === "used") {
    return { ok: false, code: "already_used", row };
  }

  if (row.status === "cancelled") {
    return { ok: false, code: "cancelled", row };
  }

  if (row.status === "expired" || isExpiredRow(row)) {
    await markAppActionTokenExpired(row.id);
    return { ok: false, code: "expired", row };
  }

  if (input.response === "reject") {
    const note = input.responseNote?.trim() ?? "";
    if (!note) {
      return { ok: false, code: "missing_reject_note", row };
    }
  }

  const nowIso = new Date().toISOString();
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("app_action_tokens")
    .update({
      status: "used",
      used_at: nowIso,
      responded_at: nowIso,
      response: input.response,
      response_note:
        input.response === "reject" ? input.responseNote?.trim() ?? null : null,
      responder_ip: input.responderIp ?? null,
      responder_user_agent: input.responderUserAgent ?? null,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .is("used_at", null)
    .select("*")
    .maybeSingle<AppActionTokenRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return { ok: false, code: "race_conflict", row };
  }

  return {
    ok: true,
    row: {
      ...data,
      metadata: parseMetadata(data.metadata),
    },
  };
}

export async function getAppActionTokenPageContext(
  rawToken: string,
  options?: { targetAlreadyHandled?: boolean }
): Promise<AppActionTokenPageView> {
  if (!isValidAppActionRawToken(rawToken)) {
    return {
      state: "invalid",
      message: "Ce lien n'est pas valide.",
    };
  }

  let row: AppActionTokenRow | null;
  try {
    row = await findAppActionTokenByRawToken(rawToken);
  } catch {
    return {
      state: "config_error",
      message: "Impossible de charger cette demande pour le moment.",
    };
  }

  if (!row) {
    return {
      state: "invalid",
      message: "Ce lien n'est pas reconnu.",
    };
  }

  const metadata = row.metadata;
  const title = metadata.title?.trim() || "Action requise";
  const summary =
    metadata.summary?.trim() ||
    "Une decision est requise de votre part dans TAGORA Time.";

  if (row.status === "used") {
    return {
      state: "used",
      message: "Ce lien a deja ete utilise.",
      response: row.response,
    };
  }

  if (row.status === "cancelled") {
    return {
      state: "invalid",
      message: "Ce lien n'est plus actif.",
    };
  }

  if (row.status === "expired" || isExpiredRow(row)) {
    await markAppActionTokenExpired(row.id);
    return {
      state: "expired",
      message:
        "Ce lien a expire. Ouvrez TAGORA Time pour traiter la demande depuis l'application.",
    };
  }

  if (options?.targetAlreadyHandled) {
    return {
      state: "already_handled",
      message: "Cette demande a deja ete traitee.",
    };
  }

  return {
    state: "ready",
    title,
    summary,
    detailRows: metadata.detailRows ?? [],
    expiresAtLabel: formatExpiresAtLabel(row.expires_at),
  };
}
