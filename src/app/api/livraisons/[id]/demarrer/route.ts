import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildDeliveryTrackingUrl,
  generateDeliveryTrackingToken,
  getDeliveryStatusLabel,
} from "@/app/lib/delivery-tracking";
import { sendDeliveryTrackingSms } from "@/app/lib/notifications";

type LivraisonRow = {
  id: number;
  client: string | null;
  client_phone: string | null;
  statut: string | null;
  tracking_token: string | null;
  tracking_enabled: boolean | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }

    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as { kmDepart?: unknown };
    const kmDepart = Number(body.kmDepart);

    if (!Number.isFinite(kmDepart) || kmDepart < 0) {
      return NextResponse.json(
        { error: "Le km depart doit etre un nombre valide." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: livraison, error: livraisonError } = await supabase
      .from("livraisons_planifiees")
      .select("id, client, client_phone, statut, tracking_token, tracking_enabled")
      .eq("id", Number(id))
      .maybeSingle<LivraisonRow>();

    if (livraisonError) {
      throw livraisonError;
    }

    if (!livraison) {
      return NextResponse.json({ error: "Livraison introuvable." }, { status: 404 });
    }

    if (livraison.statut === "livree") {
      return NextResponse.json(
        { error: "Cette livraison est deja marquee comme livree." },
        { status: 409 }
      );
    }

    const trackingToken = livraison.tracking_token || generateDeliveryTrackingToken();
    const trackingEnabled = livraison.tracking_enabled ?? true;
    const startedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("livraisons_planifiees")
      .update({
        statut: "en_cours",
        heure_depart_reelle: startedAt,
        km_depart: kmDepart,
        tracking_token: trackingToken,
        tracking_enabled: trackingEnabled,
      })
      .eq("id", livraison.id)
      .select("id, tracking_token, client_phone")
      .single();

    if (updateError) {
      throw updateError;
    }

    const trackingUrl = buildDeliveryTrackingUrl(trackingToken);
    let sms:
      | { sent: boolean; skipped: boolean; reason: string | null }
      | { sent: true; skipped: false; reason: null };

    if (trackingEnabled && updated.client_phone) {
      sms = await sendDeliveryTrackingSms({
        clientName: livraison.client,
        phone: updated.client_phone,
        trackingUrl,
        statusLabel: getDeliveryStatusLabel("en_cours"),
      });

      if (sms.sent) {
        await supabase
          .from("livraisons_planifiees")
          .update({ tracking_sms_sent_at: new Date().toISOString() })
          .eq("id", livraison.id);
      }
    } else {
      sms = {
        sent: false,
        skipped: true,
        reason: updated.client_phone ? "tracking_disabled" : "missing_client_phone",
      };
    }

    return NextResponse.json({
      success: true,
      trackingUrl,
      sms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors du demarrage.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
