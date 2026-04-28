import { NextRequest, NextResponse } from "next/server";
import {
  extractRoleFromUser,
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { isValidEmail } from "@/app/lib/account-requests.shared";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

async function loadTargetAdminUser(userId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { user: null as null };
  }
  if (extractRoleFromUser(data.user) !== "admin") {
    return { user: null as null };
  }
  return { user: data.user };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user: caller, role } = await getAuthenticatedRequestUser(req);

    if (!caller) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux administrateurs." }, { status: 403 });
    }

    const { userId: rawId } = await params;
    const userId = String(rawId ?? "").trim();
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Identifiant utilisateur invalide." }, { status: 400 });
    }

    const { user: target } = await loadTargetAdminUser(userId);
    if (!target) {
      return NextResponse.json({ error: "Profil introuvable ou non administrateur." }, { status: 404 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("admin_improvement_notification_preferences")
      .select(
        "improvements_email_notifications_enabled, improvements_sms_notifications_enabled, improvements_notification_email, improvements_notification_phone, updated_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[admin/accounts/.../improvement-notifications][GET]", error);
      return NextResponse.json(
        { error: "Impossible de charger les preferences." },
        { status: 500 }
      );
    }

    const accountEmail = target.email ?? "";

    if (!data) {
      return NextResponse.json({
        improvements_email_notifications_enabled: true,
        improvements_sms_notifications_enabled: false,
        improvements_notification_email: accountEmail || null,
        improvements_notification_phone: null,
        updated_at: null,
        accountEmail,
      });
    }

    return NextResponse.json({
      improvements_email_notifications_enabled: Boolean(
        data.improvements_email_notifications_enabled
      ),
      improvements_sms_notifications_enabled: Boolean(
        data.improvements_sms_notifications_enabled
      ),
      improvements_notification_email:
        (data.improvements_notification_email as string | null)?.trim() || accountEmail || null,
      improvements_notification_phone: (data.improvements_notification_phone as string | null) ?? null,
      updated_at: data.updated_at ?? null,
      accountEmail,
    });
  } catch (e) {
    console.error("[admin/accounts/.../improvement-notifications][GET] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user: caller, role } = await getAuthenticatedRequestUser(req);

    if (!caller) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "admin") {
      return NextResponse.json({ error: "Acces reserve aux administrateurs." }, { status: 403 });
    }

    const { userId: rawId } = await params;
    const userId = String(rawId ?? "").trim();
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "Identifiant utilisateur invalide." }, { status: 400 });
    }

    const { user: target } = await loadTargetAdminUser(userId);
    if (!target) {
      return NextResponse.json({ error: "Profil introuvable ou non administrateur." }, { status: 404 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const emailEnabled = normalizeBool(body.improvements_email_notifications_enabled, true);
    const smsEnabled = normalizeBool(body.improvements_sms_notifications_enabled, false);
    const emailRaw =
      typeof body.improvements_notification_email === "string"
        ? body.improvements_notification_email.trim()
        : "";
    const phoneRaw =
      typeof body.improvements_notification_phone === "string"
        ? body.improvements_notification_phone.trim()
        : "";

    const accountEmail = target.email?.trim() ?? "";
    const emailForRow = emailRaw || accountEmail || null;

    if (emailEnabled && emailForRow && !isValidEmail(emailForRow)) {
      return NextResponse.json(
        { error: "Adresse courriel de notification invalide." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from("admin_improvement_notification_preferences").upsert(
      {
        user_id: userId,
        improvements_email_notifications_enabled: emailEnabled,
        improvements_sms_notifications_enabled: smsEnabled,
        improvements_notification_email: emailForRow,
        improvements_notification_phone: phoneRaw || null,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[admin/accounts/.../improvement-notifications][PATCH]", error);
      return NextResponse.json(
        { error: "Impossible d enregistrer les preferences." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[admin/accounts/.../improvement-notifications][PATCH] unexpected", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
