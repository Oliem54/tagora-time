import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  isAuthorizationRequestType,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req, "terrain");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const body = (await req.json()) as {
      request_type?: unknown;
      requested_value?: Record<string, unknown>;
      justification?: unknown;
      company_context?: unknown;
    };

    if (!isAuthorizationRequestType(body.request_type)) {
      return NextResponse.json(
        { error: "Type de demande d autorisation invalide." },
        { status: 400 }
      );
    }

    const chauffeurId = Number(auth.user.app_metadata?.chauffeur_id ?? auth.user.user_metadata?.chauffeur_id);
    const companyContext = resolveCompanyContext(auth.user, body.company_context);
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("authorization_requests")
      .insert([
        {
          user_id: auth.user.id,
          chauffeur_id: Number.isFinite(chauffeurId) ? chauffeurId : null,
          company_context: companyContext,
          request_type: body.request_type,
          requested_value: body.requested_value ?? {},
          justification: String(body.justification ?? "").trim() || null,
        },
      ])
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await supabase.from("horodateur_events").insert([
      {
        user_id: auth.user.id,
        event_type: "authorization_requested",
        company_context: companyContext,
        source_module: "authorization_requests_api",
        notes: data.justification,
        metadata: {
          authorization_request_id: data.id,
          request_type: data.request_type,
        },
      },
    ]);

    return NextResponse.json({ success: true, authorization_request: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur creation demande d autorisation.",
      },
      { status: 500 }
    );
  }
}
