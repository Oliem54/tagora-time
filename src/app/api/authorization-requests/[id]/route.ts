import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { requireDirectionUser } from "@/app/lib/timeclock-api.server";

type AuthorizationRequestRow = {
  id: string;
  user_id: string;
  company_context: string;
  request_type: string;
  status: string;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionUser(req, "terrain");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const { id } = await params;
    const body = (await req.json()) as {
      status?: unknown;
      review_note?: unknown;
    };

    const nextStatus =
      body.status === "approved"
        ? "approved"
        : body.status === "refused"
          ? "refused"
          : null;

    if (!nextStatus) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: requestRow, error: loadError } = await supabase
      .from("authorization_requests")
      .select("id, user_id, company_context, request_type, status")
      .eq("id", id)
      .maybeSingle<AuthorizationRequestRow>();

    if (loadError) {
      throw loadError;
    }

    if (!requestRow) {
      return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("authorization_requests")
      .update({
        status: nextStatus,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: String(body.review_note ?? "").trim() || null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await supabase.from("horodateur_events").insert([
      {
        user_id: requestRow.user_id,
        event_type:
          nextStatus === "approved"
            ? "authorization_approved"
            : "authorization_refused",
        company_context: requestRow.company_context,
        source_module: "authorization_review_api",
        notes: data.review_note,
        metadata: {
          authorization_request_id: requestRow.id,
          request_type: requestRow.request_type,
          reviewed_by: auth.user.id,
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
            : "Erreur revision demande d autorisation.",
      },
      { status: 500 }
    );
  }
}
