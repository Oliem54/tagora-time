import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  getDeliveryStatusLabel,
  resolveDeliveryCompanyLabel,
} from "@/app/lib/delivery-tracking";
import { toFiniteNumber } from "@/app/lib/terrain-gps";

type LivraisonRow = {
  id: number;
  client: string | null;
  adresse: string | null;
  date_livraison: string | null;
  heure_prevue: string | null;
  statut: string | null;
  tracking_enabled: boolean | null;
  chauffeur_id: string | number | null;
  vehicule_id: string | number | null;
  company_context: string | null;
};

function getPersonName(row: Record<string, unknown> | null) {
  if (!row) return null;
  const fullName = [row.prenom, row.nom].filter(Boolean).map(String).join(" ").trim();
  return String(row.nom_complet || fullName || row.nom || "");
}

function getVehicleName(row: Record<string, unknown> | null) {
  if (!row) return null;
  return String(row.nom || row.modele || row.plaque || row.identifiant || "");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token?.trim()) {
      return NextResponse.json({ error: "Token invalide." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: livraison, error: livraisonError } = await supabase
      .from("livraisons_planifiees")
      .select(
        "id, client, adresse, date_livraison, heure_prevue, statut, tracking_enabled, chauffeur_id, vehicule_id, company_context"
      )
      .eq("tracking_token", token)
      .eq("tracking_enabled", true)
      .maybeSingle<LivraisonRow>();

    if (livraisonError) {
      throw livraisonError;
    }

    if (!livraison) {
      return NextResponse.json({ error: "Lien de suivi invalide." }, { status: 404 });
    }

    const latestPositionRes = await supabase
      .from("direction_terrain_positions")
      .select(
        "latitude, longitude, recorded_at, gps_status, activity_label, speed_kmh, source_label"
      )
      .eq("livraison_id", livraison.id)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let latestPosition = latestPositionRes.data;

    if (latestPositionRes.error || !latestPosition) {
      const fallback = await supabase
        .from("gps_positions")
        .select(
          "latitude, longitude, recorded_at, gps_status, activity_label, speed_kmh, source_label"
        )
        .eq("livraison_id", livraison.id)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        throw fallback.error;
      }

      latestPosition = fallback.data;
    }

    const [chauffeurRes, vehiculeRes] = await Promise.all([
      livraison.chauffeur_id
        ? supabase
            .from("chauffeurs")
            .select("id, nom, prenom, nom_complet")
            .eq("id", livraison.chauffeur_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      livraison.vehicule_id
        ? supabase
            .from("vehicules")
            .select("id, nom, modele, plaque, identifiant")
            .eq("id", livraison.vehicule_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    return NextResponse.json({
      client: livraison.client,
      companyLabel: resolveDeliveryCompanyLabel(livraison.company_context),
      adresse: livraison.adresse,
      dateLivraison: livraison.date_livraison,
      heurePrevue: livraison.heure_prevue,
      statut: livraison.statut,
      statutLabel: getDeliveryStatusLabel(livraison.statut),
      chauffeur: getPersonName(chauffeurRes.data as Record<string, unknown> | null),
      vehicule: getVehicleName(vehiculeRes.data as Record<string, unknown> | null),
      position: latestPosition
        ? {
            latitude: toFiniteNumber(latestPosition.latitude),
            longitude: toFiniteNumber(latestPosition.longitude),
            recordedAt: latestPosition.recorded_at,
            gpsStatus: latestPosition.gps_status,
            activityLabel: latestPosition.activity_label,
            speedKmh: toFiniteNumber(latestPosition.speed_kmh),
            sourceLabel: latestPosition.source_label,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors du suivi.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
