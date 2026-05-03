import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Accès réservé à la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const channel = searchParams.get("channel");
  const audience = searchParams.get("audience");
  const implementationStatus = searchParams.get("implementation_status");
  const activeOnly = searchParams.get("active_only") === "1" || searchParams.get("active_only") === "true";

  const supabase = createAdminSupabaseClient();
  let q = supabase.from("app_communication_templates").select("*").order("category").order("name");

  if (category) {
    q = q.eq("category", category);
  }
  if (channel && (channel === "email" || channel === "sms")) {
    q = q.eq("channel", channel);
  }
  if (audience) {
    q = q.eq("audience", audience);
  }
  if (implementationStatus) {
    q = q.eq("implementation_status", implementationStatus);
  }
  if (activeOnly) {
    q = q.eq("active", true);
  }

  const { data, error } = await q;

  if (error) {
    console.error("[communications/templates]", error.message);
    return NextResponse.json({ error: "Impossible de charger les modèles." }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}
