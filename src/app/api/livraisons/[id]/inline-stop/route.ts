import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildUpdateStamp } from "@/app/lib/livraisons/audit-stamp.server";

type InlineStopPayload = {
  adresse?: unknown;
  ville?: unknown;
  code_postal?: unknown;
  province?: unknown;
  date_livraison?: unknown;
  heure_prevue?: unknown;
  statut?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  note_chauffeur?: unknown;
  commentaire_operationnel?: unknown;
};

type LivraisonInlineRow = {
  id: number;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  province: string | null;
  date_livraison: string | null;
  heure_prevue: string | null;
  statut: string | null;
  latitude: number | null;
  longitude: number | null;
  note_chauffeur: string | null;
  commentaire_operationnel: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  scheduled_by_user_id: string | null;
  scheduled_by_name: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function asNullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function buildErrorBody(
  message: string,
  payload: Record<string, unknown>,
  error?: { code?: string; details?: string; hint?: string; message?: string } | null
) {
  return {
    error: {
      message: error?.message || message,
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
      payload,
    },
  };
}

const INLINE_SELECT =
  "id, adresse, ville, code_postal, province, date_livraison, heure_prevue, statut, latitude, longitude, note_chauffeur, commentaire_operationnel, created_by_user_id, created_by_name, scheduled_by_user_id, scheduled_by_name, updated_by_user_id, updated_by_name, created_at, updated_at";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json({ error: { message: "Authentification requise." } }, { status: 401 });
    }

    if (!hasUserPermission(user, "livraisons")) {
      return NextResponse.json({ error: { message: "Acces refuse." } }, { status: 403 });
    }

    if (role !== "direction" && role !== "admin") {
      return NextResponse.json(
        { error: { message: "Action reservee a la direction/admin." } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json({ error: { message: "Identifiant livraison invalide." } }, { status: 400 });
    }

    const body = (await req.json()) as InlineStopPayload;
    const latitude = asNullableNumber(body.latitude);
    const longitude = asNullableNumber(body.longitude);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json(
        buildErrorBody("Latitude/longitude invalides.", {
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
        }),
        { status: 400 }
      );
    }

    const payload = {
      adresse: asNullableText(body.adresse),
      ville: asNullableText(body.ville),
      code_postal: asNullableText(body.code_postal),
      province: asNullableText(body.province),
      date_livraison: asNullableText(body.date_livraison),
      heure_prevue: asNullableText(body.heure_prevue),
      statut: asNullableText(body.statut),
      latitude,
      longitude,
      note_chauffeur: asNullableText(body.note_chauffeur),
      commentaire_operationnel: asNullableText(body.commentaire_operationnel),
      ...buildUpdateStamp(user),
    };

    const supabase = createAdminSupabaseClient();
    const updateRes = await supabase
      .from("livraisons_planifiees")
      .update(payload)
      .eq("id", livraisonId)
      .select(INLINE_SELECT)
      .maybeSingle<LivraisonInlineRow>();

    if (!updateRes.error && updateRes.data) {
      return NextResponse.json({ success: true, updated_row: updateRes.data });
    }

    if (!updateRes.error && !updateRes.data) {
      return NextResponse.json(
        buildErrorBody(
          "Aucune ligne mise a jour. Probable blocage RLS/policy ou filtre id.",
          payload
        ),
        { status: 409 }
      );
    }

    const updateError = updateRes.error;
    if (!updateError) {
      return NextResponse.json(
        buildErrorBody("Echec update inline-stop.", payload),
        { status: 400 }
      );
    }

    const mentionsMissingColumn =
      updateError.code === "42703" ||
      updateError.message.toLowerCase().includes("column") ||
      updateError.message.toLowerCase().includes("schema cache");

    if (mentionsMissingColumn) {
      // Fallback ultra-minimal : on retire les stamps d'audit et on ne touche qu'a
      // l'adresse, avec un SELECT restreint, pour rester compatible avec une base
      // ou les migrations recentes n'ont pas encore ete appliquees.
      const fallbackPayload = { adresse: payload.adresse };
      const fallbackRes = await supabase
        .from("livraisons_planifiees")
        .update(fallbackPayload)
        .eq("id", livraisonId)
        .select("id, adresse, statut, date_livraison, heure_prevue")
        .maybeSingle<Partial<LivraisonInlineRow>>();

      if (!fallbackRes.error && fallbackRes.data) {
        return NextResponse.json({
          success: true,
          updated_row: fallbackRes.data,
          warning:
            "Colonnes inline ou audit absentes. Appliquer migrations 20260426_120500_livraisons_planifiees_inline_stop_fields.sql et 20260513_103000_livraisons_planifiees_user_audit.sql.",
        });
      }

      if (!fallbackRes.error && !fallbackRes.data) {
        return NextResponse.json(
          buildErrorBody(
            "Aucune ligne mise a jour (fallback). Probable blocage RLS/policy ou filtre id.",
            fallbackPayload
          ),
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: {
            message: "Echec update complet + fallback.",
            code: updateError.code || null,
            details: updateError.details || null,
            hint: updateError.hint || null,
            payload,
          },
          fallback_error: {
            message: fallbackRes.error?.message || null,
            code: fallbackRes.error?.code || null,
            details: fallbackRes.error?.details || null,
            hint: fallbackRes.error?.hint || null,
            payload: fallbackPayload,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(buildErrorBody("Echec update inline-stop.", payload, updateError), {
      status: 400,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur inline-stop.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

