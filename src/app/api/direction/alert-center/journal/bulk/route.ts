import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type BulkAction =
  | "mark_all_open_handled"
  | "archive_resend_403_notification_failures"
  | "archive_old_mfa_system_noise"
  | "cleanup_test_alerts";

export async function POST(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const raw = body?.action;
  const allowed: BulkAction[] = [
    "mark_all_open_handled",
    "archive_resend_403_notification_failures",
    "archive_old_mfa_system_noise",
    "cleanup_test_alerts",
  ];
  const action = typeof raw === "string" && allowed.includes(raw as BulkAction) ? (raw as BulkAction) : null;

  if (!action) {
    return NextResponse.json({ error: "Action en lot non reconnue." }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();

  if (action === "mark_all_open_handled") {
    const { data, error } = await supabase
      .from("app_alerts")
      .update({
        status: "handled",
        handled_at: now,
        handled_by: user.id,
      })
      .in("status", ["open", "failed"])
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, action, updated: data?.length ?? 0 });
  }

  const archiveResend403 = async (): Promise<number> => {
    const { data: byKey } = await supabase
      .from("app_alerts")
      .select("id")
      .eq("category", "notification_failure")
      .in("status", ["open", "failed"])
      .like("dedupe_key", "notification_failure:email:resend_403:%");

    const { data: byMeta } = await supabase
      .from("app_alerts")
      .select("id")
      .eq("category", "notification_failure")
      .in("status", ["open", "failed"])
      .contains("metadata", { configuration_issue: true, resend_403: true });

    const idSet = new Set<string>();
    for (const r of byKey ?? []) {
      if (typeof r.id === "string") idSet.add(r.id);
    }
    for (const r of byMeta ?? []) {
      if (typeof r.id === "string") idSet.add(r.id);
    }
    const ids = [...idSet];
    if (ids.length === 0) return 0;

    const { data: upd, error } = await supabase
      .from("app_alerts")
      .update({ status: "archived", handled_at: now, handled_by: user.id })
      .in("id", ids)
      .select("id");
    return error ? 0 : upd?.length ?? 0;
  };

  const archiveOldMfa = async (): Promise<number> => {
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();

    const { data: blocked } = await supabase
      .from("app_alerts")
      .select("id")
      .eq("source_module", "security_mfa")
      .in("status", ["open", "failed"])
      .lt("created_at", cutoff)
      .contains("metadata", { kind: "mfa_audit", event: "mfa_access_blocked" });

    const { data: repeated } = await supabase
      .from("app_alerts")
      .select("id")
      .eq("source_module", "security_mfa")
      .in("status", ["open", "failed"])
      .lt("created_at", cutoff)
      .contains("metadata", { kind: "mfa_audit", event: "mfa_verify_failed_repeated" });

    const idSet = new Set<string>();
    for (const r of blocked ?? []) {
      if (typeof r.id === "string") idSet.add(r.id);
    }
    for (const r of repeated ?? []) {
      if (typeof r.id === "string") idSet.add(r.id);
    }
    const ids = [...idSet];
    if (ids.length === 0) return 0;

    const { data: upd, error } = await supabase
      .from("app_alerts")
      .update({ status: "archived", handled_at: now, handled_by: user.id })
      .in("id", ids)
      .select("id");
    return error ? 0 : upd?.length ?? 0;
  };

  if (action === "archive_resend_403_notification_failures") {
    const n = await archiveResend403();
    return NextResponse.json({ success: true, action, updated: n });
  }

  if (action === "archive_old_mfa_system_noise") {
    const n = await archiveOldMfa();
    return NextResponse.json({ success: true, action, updated: n });
  }

  if (action === "cleanup_test_alerts") {
    const a = await archiveResend403();
    const b = await archiveOldMfa();
    return NextResponse.json({ success: true, action, updated: a + b });
  }

  return NextResponse.json({ error: "Action interne." }, { status: 500 });
}
