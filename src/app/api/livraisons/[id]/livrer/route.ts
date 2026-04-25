import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type LivraisonRow = {
  id: number;
  statut: string | null;
  heure_depart_reelle: string | null;
  type_operation: string | null;
};

type LivrerBody = {
  kmArrivee?: unknown;
  proof?: {
    note?: unknown;
    acknowledged?: unknown;
    acknowledgedBy?: unknown;
  } | null;
  incident?: {
    category?: unknown;
    description?: unknown;
  } | null;
};

function calculerTempsTotal(departIso: string, retourIso: string) {
  const depart = new Date(departIso).getTime();
  const retour = new Date(retourIso).getTime();
  const diffMs = retour - depart;

  if (diffMs <= 0) return "0 min";

  const totalMinutes = Math.floor(diffMs / 1000 / 60);
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (heures > 0) {
    return `${heures}h ${minutes}min`;
  }

  return `${minutes} min`;
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseIncidentCategory(value: string) {
  return ["dommage", "piece_manquante", "autre"].includes(value) ? value : null;
}

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
    const livraisonId = Number(id);

    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json({ error: "Identifiant livraison invalide." }, { status: 400 });
    }

    const body = (await req.json()) as LivrerBody;
    const kmArrivee = Number(body.kmArrivee);

    if (!Number.isFinite(kmArrivee) || kmArrivee < 0) {
      return NextResponse.json(
        { error: "Le km arrivee doit etre un nombre valide." },
        { status: 400 }
      );
    }

    const proofNote = sanitizeText(body.proof?.note);
    const proofAcknowledged = Boolean(body.proof?.acknowledged);
    const proofAcknowledgedBy = sanitizeText(body.proof?.acknowledgedBy);
    const shouldSaveProof =
      proofNote.length > 0 || proofAcknowledged || proofAcknowledgedBy.length > 0;

    const incidentCategory = parseIncidentCategory(
      sanitizeText(body.incident?.category)
    );
    const incidentDescription = sanitizeText(body.incident?.description);
    const shouldSaveIncident = Boolean(incidentCategory || incidentDescription.length > 0);

    if (shouldSaveIncident && !incidentCategory) {
      return NextResponse.json(
        { error: "Categorie incident invalide." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: livraison, error: livraisonError } = await supabase
      .from("livraisons_planifiees")
      .select("id, statut, heure_depart_reelle, type_operation")
      .eq("id", livraisonId)
      .maybeSingle<LivraisonRow>();

    if (livraisonError) {
      throw livraisonError;
    }

    if (!livraison) {
      return NextResponse.json({ error: "Livraison introuvable." }, { status: 404 });
    }

    if (livraison.statut !== "en_cours") {
      return NextResponse.json(
        { error: "La livraison doit etre en cours pour etre marquee livree." },
        { status: 409 }
      );
    }

    const heureLivree = new Date().toISOString();
    const tempsTotal = livraison.heure_depart_reelle
      ? calculerTempsTotal(livraison.heure_depart_reelle, heureLivree)
      : null;

    const { error: updateError } = await supabase
      .from("livraisons_planifiees")
      .update({
        statut: "livree",
        heure_livree: heureLivree,
        km_arrivee: kmArrivee,
        temps_total: tempsTotal,
      })
      .eq("id", livraison.id);

    if (updateError) {
      throw updateError;
    }

    let proofSaved = false;
    let incidentSaved = false;

    if (shouldSaveProof) {
      const proofType =
        livraison.type_operation === "ramassage_client" ? "pickup_note" : "handover_note";

      const { error: proofError } = await supabase.from("delivery_proofs").insert({
        livraison_id: livraison.id,
        proof_type: proofType,
        proof_data: {
          note: proofNote,
          acknowledged: proofAcknowledged,
          acknowledgedBy: proofAcknowledgedBy || null,
          source: "employe_livraisons_phase_b",
        },
        captured_by: user.id,
      });

      if (proofError) {
        throw proofError;
      }

      proofSaved = true;
    }

    if (shouldSaveIncident && incidentCategory) {
      const { data: incidentRow, error: incidentError } = await supabase
        .from("delivery_incidents")
        .insert({
          livraison_id: livraison.id,
          incident_category: incidentCategory,
          severity: "medium",
          description: incidentDescription || null,
          requires_sav: false,
          status: "open",
          detected_by: user.id,
        })
        .select("id")
        .single();

      if (incidentError) {
        throw incidentError;
      }

      if (incidentRow?.id) {
        const { error: serviceCaseError } = await supabase.from("service_cases").insert({
          livraison_id: livraison.id,
          incident_id: incidentRow.id,
          status: "draft",
          summary:
            incidentDescription ||
            `Incident ${incidentCategory} sur livraison #${livraison.id}`,
          created_by: user.id,
          odoo_sync_status: "pending",
        });

        if (serviceCaseError) {
          throw serviceCaseError;
        }
      }

      incidentSaved = true;
    }

    return NextResponse.json({
      success: true,
      livraisonUpdated: true,
      proofSaved,
      incidentSaved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur lors de la livraison.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
