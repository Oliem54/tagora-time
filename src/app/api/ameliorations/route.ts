import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  IMPROVEMENT_DEFAULT_STATUS,
  IMPROVEMENT_MODULE_OPTIONS,
  IMPROVEMENT_PRIORITY_OPTIONS,
  type ImprovementModule,
  type ImprovementPriority,
} from "@/app/lib/improvements";

function isImprovementModule(value: unknown): value is ImprovementModule {
  return typeof value === "string" && IMPROVEMENT_MODULE_OPTIONS.includes(value as ImprovementModule);
}

function isImprovementPriority(value: unknown): value is ImprovementPriority {
  return typeof value === "string" && IMPROVEMENT_PRIORITY_OPTIONS.includes(value as ImprovementPriority);
}

export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    const body = (await req.json()) as {
      module?: unknown;
      priority?: unknown;
      title?: unknown;
      description?: unknown;
    };

    const moduleValue = body.module;
    const priorityValue = body.priority;
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();

    if (!isImprovementModule(moduleValue)) {
      return NextResponse.json({ error: "Module invalide." }, { status: 400 });
    }

    if (!isImprovementPriority(priorityValue)) {
      return NextResponse.json({ error: "Priorite invalide." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "Titre requis." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Description requise." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("app_improvements")
      .insert([
        {
          module: moduleValue,
          priority: priorityValue,
          title,
          description,
          status: IMPROVEMENT_DEFAULT_STATUS,
          created_by_user_id: user.id,
          created_by_email: user.email ?? null,
          created_by_role: role ?? null,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.error("[ameliorations][POST] insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        userId: user.id,
        module: moduleValue,
        priority: priorityValue,
        titleLength: title.length,
        descriptionLength: description.length,
      });

      return NextResponse.json(
        {
          error:
            error.code === "42P01"
              ? "La table app_improvements est absente en base."
              : error.code === "42703"
                ? "Une colonne requise manque dans app_improvements."
                : "Impossible d enregistrer l amelioration.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, improvementId: data.id });
  } catch (error) {
    console.error("[ameliorations][POST] unexpected error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur lors de l envoi de l amelioration.",
      },
      { status: 500 }
    );
  }
}
