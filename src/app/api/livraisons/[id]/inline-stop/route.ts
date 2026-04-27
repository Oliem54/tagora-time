import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type InlineStopPayload = {
  adresse?: unknown;
  ville?: unknown;
  code_postal?: unknown;
  province?: unknown;
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
  latitude: number | null;
  longitude: number | null;
  note_chauffeur: string | null;
  commentaire_operationnel: string | null;
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
  "id, adresse, ville, code_postal, province, latitude, longitude, note_chauffeur, commentaire_operationnel";

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
      latitude,
      longitude,
      note_chauffeur: asNullableText(body.note_chauffeur),
      commentaire_operationnel: asNullableText(body.commentaire_operationnel),
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

    const mentionsMissingColumn =
      updateRes.error.code === "42703" ||
      updateRes.error.message.toLowerCase().includes("column") ||
      updateRes.error.message.toLowerCase().includes("schema cache");

    if (mentionsMissingColumn) {
      const fallbackPayload = { adresse: payload.adresse };
      const fallbackRes = await supabase
        .from("livraisons_planifiees")
        .update(fallbackPayload)
        .eq("id", livraisonId)
        .select(INLINE_SELECT)
        .maybeSingle<LivraisonInlineRow>();

      if (!fallbackRes.error && fallbackRes.data) {
        return NextResponse.json({
          success: true,
          updated_row: fallbackRes.data,
          warning:
            "Colonnes inline absentes. Appliquer migration 20260426_120500_livraisons_planifiees_inline_stop_fields.sql.",
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
            code: updateRes.error.code || null,
            details: updateRes.error.details || null,
            hint: updateRes.error.hint || null,
            payload,
          },
          fallback_error: {
            message: fallbackRes.error.message || null,
            code: fallbackRes.error.code || null,
            details: fallbackRes.error.details || null,
            hint: fallbackRes.error.hint || null,
            payload: fallbackPayload,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(buildErrorBody("Echec update inline-stop.", payload, updateRes.error), {
      status: 400,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur inline-stop.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

