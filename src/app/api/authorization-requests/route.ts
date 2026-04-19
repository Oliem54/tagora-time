import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { notifyDirectionOfAuthorizationRequest } from "@/app/lib/notifications";
import { type AccountRequestCompany } from "@/app/lib/account-requests.shared";
import {
  isAuthorizationRequestType,
  requireAuthenticatedUser,
  resolveCompanyContext,
} from "@/app/lib/timeclock-api.server";

type AlertChauffeurProfileRow = {
  nom: string | null;
  courriel: string | null;
  telephone: string | null;
  primary_company: AccountRequestCompany | null;
};

function getAuthUserDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}) {
  const candidates = [
    user.user_metadata?.full_name,
    user.user_metadata?.name,
    user.app_metadata?.full_name,
    user.email,
  ];

  const match = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  return typeof match === "string" ? match.trim() : null;
}

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

    const chauffeurId = Number(
      auth.user.app_metadata?.chauffeur_id ??
        auth.user.user_metadata?.chauffeur_id
    );
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

    console.info("[authorization-requests][create] request_stored", {
      requestId: data.id,
      requestType: data.request_type,
      companyContext,
      userId: auth.user.id,
      chauffeurId: Number.isFinite(chauffeurId) ? chauffeurId : null,
      requestedAt: data.requested_at ?? null,
    });

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

    let requesterProfile: AlertChauffeurProfileRow | null = null;

    if (Number.isFinite(chauffeurId)) {
      const { data: chauffeurProfile } = await supabase
        .from("chauffeurs")
        .select("nom, courriel, telephone, primary_company")
        .eq("id", chauffeurId)
        .maybeSingle<AlertChauffeurProfileRow>();

      requesterProfile = chauffeurProfile ?? null;
    }

    await notifyDirectionOfAuthorizationRequest({
      requestId: data.id,
      requestType: data.request_type,
      requesterName: requesterProfile?.nom ?? getAuthUserDisplayName(auth.user),
      requesterEmail: requesterProfile?.courriel ?? auth.user.email ?? null,
      requesterPhone: requesterProfile?.telephone ?? null,
      company: requesterProfile?.primary_company ?? companyContext,
      justification: data.justification,
      requestedValue:
        data.requested_value && typeof data.requested_value === "object"
          ? (data.requested_value as Record<string, unknown>)
          : {},
      requestedAt:
        typeof data.requested_at === "string"
          ? data.requested_at
          : new Date().toISOString(),
      managementUrl: "/direction/horodateur",
    });

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
