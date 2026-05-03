import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Action = "activate" | "deactivate";

function jsonError(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function PATCH(
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError(400, "Corps JSON invalide.");
    }

    const action = body.action as Action | undefined;
    if (action !== "activate" && action !== "deactivate") {
      return jsonError(400, 'Body attendu : { "action": "activate" | "deactivate" }.');
    }

    const supabase = createAdminSupabaseClient();

    const patch: Record<string, unknown> =
      action === "activate"
        ? { actif: true }
        : {
            actif: false,
            schedule_active: false,
          };

    const { data, error } = await supabase
      .from("chauffeurs")
      .update(patch)
      .eq("id", employeeId)
      .select("*")
      .maybeSingle();

    if (error) {
      const msg = error.message?.includes("schedule_active")
        ? await tryUpdateWithoutScheduleActive(supabase, employeeId, action)
        : null;
      if (msg) {
        return NextResponse.json(msg);
      }
      console.error("[employee-activation]", error);
      return jsonError(500, error.message ?? "Mise à jour impossible.");
    }

    if (!data) {
      return jsonError(404, "Employé introuvable.");
    }

    if (action === "activate") {
      return NextResponse.json({
        success: true,
        status: "active",
        message: "Compte réactivé.",
        profile: data,
      });
    }

    return NextResponse.json({
      success: true,
      status: "inactive",
      message: "Compte désactivé. L'historique est conservé.",
      profile: data,
    });
  } catch (e) {
    console.error("[employee-activation]", e);
    return jsonError(500, e instanceof Error ? e.message : "Erreur inattendue.");
  }
}

async function tryUpdateWithoutScheduleActive(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  employeeId: number,
  action: Action
) {
  const patch: Record<string, unknown> = action === "activate" ? { actif: true } : { actif: false };
  const { data, error } = await supabase
    .from("chauffeurs")
    .update(patch)
    .eq("id", employeeId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (action === "activate") {
    return {
      success: true,
      status: "active",
      message: "Compte réactivé.",
      profile: data,
    };
  }
  return {
    success: true,
    status: "inactive",
    message: "Compte désactivé. L'historique est conservé.",
    profile: data,
  };
}
