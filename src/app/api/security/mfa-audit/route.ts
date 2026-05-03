import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  bumpAppAlertByDedupeKey,
  insertAppAlert,
  markOpenMfaSecurityAlertsHandled,
} from "@/app/lib/app-alerts.server";
import { APP_ALERT_CATEGORY } from "@/app/lib/app-alerts.shared";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";

export const dynamic = "force-dynamic";

type MfaAuditEvent =
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_verify_failed"
  | "mfa_verify_failed_repeated"
  | "mfa_access_blocked"
  | "mfa_verify_succeeded";

const MFA_AUDIT_METADATA = { kind: "mfa_audit" } as const;

/** Fenêtre de dédup pour « accès sans AAL2 » (évite une ligne par requête). */
const AAL2_BLOCKED_BUCKET_MS = 15 * 60_000;

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { event?: unknown } | null;
    const raw = body?.event;
    const allowed: MfaAuditEvent[] = [
      "mfa_enabled",
      "mfa_disabled",
      "mfa_verify_failed",
      "mfa_verify_failed_repeated",
      "mfa_access_blocked",
      "mfa_verify_succeeded",
    ];
    const event =
      typeof raw === "string" && allowed.includes(raw as MfaAuditEvent) ? (raw as MfaAuditEvent) : null;

    if (!event) {
      return NextResponse.json({ error: "Événement invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    if (event === "mfa_verify_succeeded") {
      await markOpenMfaSecurityAlertsHandled(supabase, {
        userId: user.id,
        handledByUserId: user.id,
      });
      return NextResponse.json({ ok: true });
    }

    // 1–2 échecs : journal applicatif seulement, pas d’entrée centre d’alertes.
    if (event === "mfa_verify_failed") {
      return NextResponse.json({ ok: true, journalOnly: true });
    }

    if (event === "mfa_verify_failed_repeated") {
      const dedupeKey = `mfa_verify_failed_repeated:${user.id}`;
      const ins = await insertAppAlert(supabase, {
        category: APP_ALERT_CATEGORY.system,
        priority: "high",
        title: "Échecs MFA répétés (direction/admin)",
        body: `Plusieurs codes MFA refusés pour ${user.email ?? user.id}.`,
        sourceModule: "security_mfa",
        metadata: {
          ...MFA_AUDIT_METADATA,
          event,
          userId: user.id,
          role,
          mandatoryRole: roleRequiresMandatoryMfa(role),
          failure_count: 1,
        },
        dedupeKey,
      });
      if (ins.skippedDuplicate) {
        await bumpAppAlertByDedupeKey(supabase, dedupeKey, {
          last_notified_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (event === "mfa_access_blocked") {
      const bucket = Math.floor(Date.now() / AAL2_BLOCKED_BUCKET_MS);
      const dedupeKey = `mfa_aal2_blocked:${user.id}:${bucket}`;
      const ins = await insertAppAlert(supabase, {
        category: APP_ALERT_CATEGORY.system,
        priority: "medium",
        title: "Accès direction/admin sans session MFA complète",
        body: `Tentative d’accès sans niveau AAL2 (${user.email ?? user.id}).`,
        sourceModule: "security_mfa",
        metadata: {
          ...MFA_AUDIT_METADATA,
          event,
          userId: user.id,
          role,
          mandatoryRole: roleRequiresMandatoryMfa(role),
          failure_count: 1,
        },
        dedupeKey,
      });
      if (ins.skippedDuplicate) {
        await bumpAppAlertByDedupeKey(supabase, dedupeKey, {
          last_blocked_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({ ok: true });
    }

    const titles: Record<"mfa_enabled" | "mfa_disabled", string> = {
      mfa_enabled: "MFA activée (compte direction/admin)",
      mfa_disabled: "MFA désactivée (compte direction/admin)",
    };

    await insertAppAlert(supabase, {
      category: APP_ALERT_CATEGORY.system,
      priority: "medium",
      title: titles[event],
      body: `Utilisateur : ${user.email ?? user.id}. Rôle : ${role ?? "inconnu"}.`,
      sourceModule: "security_mfa",
      metadata: {
        ...MFA_AUDIT_METADATA,
        event,
        userId: user.id,
        role,
        mandatoryRole: roleRequiresMandatoryMfa(role),
      },
      dedupeKey: `${event}:${user.id}:${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur enregistrement audit MFA.",
      },
      { status: 500 }
    );
  }
}
