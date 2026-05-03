import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { insertAppAlert } from "@/app/lib/app-alerts.server";
import { APP_ALERT_CATEGORY } from "@/app/lib/app-alerts.shared";
import { roleRequiresMandatoryMfa } from "@/app/lib/auth/mfa.shared";

export const dynamic = "force-dynamic";

type MfaAuditEvent =
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_verify_failed"
  | "mfa_verify_failed_repeated"
  | "mfa_access_blocked";

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
    ];
    const event = typeof raw === "string" && allowed.includes(raw as MfaAuditEvent) ? (raw as MfaAuditEvent) : null;

    if (!event) {
      return NextResponse.json({ error: "Événement invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    const titles: Record<MfaAuditEvent, string> = {
      mfa_enabled: "MFA activée (compte direction/admin)",
      mfa_disabled: "MFA désactivée (compte direction/admin)",
      mfa_verify_failed: "Échec de vérification MFA",
      mfa_verify_failed_repeated: "Échecs MFA répétés (direction/admin)",
      mfa_access_blocked: "Accès direction/admin sans session MFA complète",
    };

    const priority: "critical" | "high" | "medium" | "low" =
      event === "mfa_verify_failed" ||
      event === "mfa_verify_failed_repeated" ||
      event === "mfa_access_blocked"
        ? "high"
        : "medium";

    await insertAppAlert(supabase, {
      category: APP_ALERT_CATEGORY.system,
      priority,
      title: titles[event],
      body:
        event === "mfa_access_blocked"
          ? `Tentative d’accès aux API ou à l’interface sans niveau AAL2 (${user.email ?? user.id}).`
          : event === "mfa_verify_failed_repeated"
            ? `Plusieurs codes MFA refusés pour ${user.email ?? user.id}.`
            : event === "mfa_verify_failed"
              ? `Code MFA refusé pour ${user.email ?? user.id}.`
              : `Utilisateur : ${user.email ?? user.id}. Rôle : ${role ?? "inconnu"}.`,
      sourceModule: "security_mfa",
      metadata: {
        kind: "mfa_audit",
        event,
        userId: user.id,
        role,
        mandatoryRole: roleRequiresMandatoryMfa(role),
      },
      dedupeKey:
        event === "mfa_verify_failed" || event === "mfa_verify_failed_repeated"
          ? null
          : event === "mfa_access_blocked"
            ? `mfa_blocked:${user.id}:${Math.floor(Date.now() / 60_000)}`
            : `${event}:${user.id}:${Date.now()}`,
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
