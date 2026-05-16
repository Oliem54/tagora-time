import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { generateDeliveryTrackingToken } from "@/app/lib/delivery-tracking";
import { assertCanTriggerEnRoute } from "@/app/lib/livraisons/livraison-access.server";
import { notifyClientEnRoute } from "@/app/lib/livraisons/en-route-notify.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type LivraisonRow = {
  id: number;
  client: string | null;
  client_phone: string | null;
  statut: string | null;
  tracking_token: string | null;
  tracking_enabled: boolean | null;
  company_context: string | null;
  dossier_id: number | null;
  type_operation: string | null;
  chauffeur_id: number | string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      kmDepart?: unknown;
      estimatedArrival?: unknown;
      estimatedMinutes?: unknown;
    };

    const kmDepartRaw = body.kmDepart;
    const kmDepart =
      kmDepartRaw != null && kmDepartRaw !== ""
        ? Number(kmDepartRaw)
        : null;
    if (kmDepart != null && (!Number.isFinite(kmDepart) || kmDepart < 0)) {
      return NextResponse.json(
        { error: "Le km depart doit etre un nombre valide." },
        { status: 400 }
      );
    }

    const estimatedArrival =
      typeof body.estimatedArrival === "string" && body.estimatedArrival.trim()
        ? body.estimatedArrival.trim()
        : null;
    const estimatedMinutesRaw = Number(body.estimatedMinutes);
    const estimatedMinutes = Number.isFinite(estimatedMinutesRaw)
      ? estimatedMinutesRaw
      : null;

    const supabase = createAdminSupabaseClient();
    const { data: livraison, error: livraisonError } = await supabase
      .from("livraisons_planifiees")
      .select(
        "id, client, client_phone, statut, tracking_token, tracking_enabled, company_context, dossier_id, type_operation, chauffeur_id"
      )
      .eq("id", Number(id))
      .maybeSingle<LivraisonRow>();

    if (livraisonError) {
      throw livraisonError;
    }

    if (!livraison) {
      return NextResponse.json({ error: "Livraison introuvable." }, { status: 404 });
    }

    const access = await assertCanTriggerEnRoute({
      supabase,
      authUserId: user.id,
      role,
      livraison,
    });
    if (!access.allowed) {
      return NextResponse.json({ error: access.message }, { status: access.status });
    }

    if (String(livraison.type_operation || "").toLowerCase() === "ramassage_client") {
      return NextResponse.json(
        { error: "Cette operation est un ramassage, pas une livraison." },
        { status: 400 }
      );
    }

    const statut = String(livraison.statut || "").toLowerCase();
    if (statut === "livree") {
      return NextResponse.json(
        { error: "Cette livraison est deja marquee comme livree." },
        { status: 409 }
      );
    }
    if (statut === "annulee") {
      return NextResponse.json(
        { error: "Cette livraison est annulee." },
        { status: 409 }
      );
    }

    const trackingToken = livraison.tracking_token || generateDeliveryTrackingToken();
    const trackingEnabled = livraison.tracking_enabled ?? true;
    const startedAt = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      statut: "en_cours",
      heure_depart_reelle: startedAt,
      tracking_token: trackingToken,
      tracking_enabled: trackingEnabled,
    };
    if (kmDepart != null) {
      updatePayload.km_depart = kmDepart;
    }

    const { data: updated, error: updateError } = await supabase
      .from("livraisons_planifiees")
      .update(updatePayload)
      .eq("id", livraison.id)
      .select("id, tracking_token, client_phone, statut, heure_depart_reelle")
      .single();

    if (updateError) {
      throw updateError;
    }

    let dossier: Record<string, unknown> | null = null;
    if (livraison.dossier_id != null && Number.isFinite(livraison.dossier_id)) {
      const { data: dossierRow } = await supabase
        .from("dossiers")
        .select("*")
        .eq("id", livraison.dossier_id)
        .maybeSingle();
      dossier = (dossierRow as Record<string, unknown> | null) ?? null;
    }

    const notify = await notifyClientEnRoute({
      livraison,
      trackingToken,
      dossier,
      estimatedArrival,
      estimatedMinutes,
    });

    if (notify.sms.sent) {
      await supabase
        .from("livraisons_planifiees")
        .update({ tracking_sms_sent_at: new Date().toISOString() })
        .eq("id", livraison.id);
    }

    return NextResponse.json({
      success: true,
      updated_row: updated,
      trackingUrl: notify.trackingUrl,
      sms: notify.sms,
      email: notify.email,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors du passage en route.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
