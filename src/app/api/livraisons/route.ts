import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildCreateStamp } from "@/app/lib/livraisons/audit-stamp.server";

type LivraisonCreatePayload = {
  dossier_id?: unknown;
  client?: unknown;
  client_phone?: unknown;
  adresse?: unknown;
  ville?: unknown;
  code_postal?: unknown;
  province?: unknown;
  date_livraison?: unknown;
  heure_prevue?: unknown;
  chauffeur_id?: unknown;
  vehicule_id?: unknown;
  remorque_id?: unknown;
  statut?: unknown;
  company_context?: unknown;
  notes?: unknown;
  note_chauffeur?: unknown;
  commentaire_operationnel?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  type_operation?: unknown;
  ordre_arret?: unknown;
};

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function asFloat(value: unknown): number | null | typeof NaN {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * POST /api/livraisons
 * Cree une nouvelle livraison planifiee.
 * Stamp automatiquement les champs created_by_*, scheduled_by_*, updated_by_*,
 * created_at et updated_at a partir de l'utilisateur authentifie.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);

    if (!user) {
      return NextResponse.json(
        { error: { message: "Authentification requise." } },
        { status: 401 }
      );
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

    const body = (await req.json()) as LivraisonCreatePayload;

    const latitude = asFloat(body.latitude);
    const longitude = asFloat(body.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json(
        { error: { message: "Latitude/longitude invalides." } },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      dossier_id: asInteger(body.dossier_id),
      client: asText(body.client),
      client_phone: asText(body.client_phone),
      adresse: asText(body.adresse),
      ville: asText(body.ville),
      code_postal: asText(body.code_postal),
      province: asText(body.province),
      date_livraison: asText(body.date_livraison),
      heure_prevue: asText(body.heure_prevue),
      chauffeur_id: asInteger(body.chauffeur_id),
      vehicule_id: asInteger(body.vehicule_id),
      remorque_id: asInteger(body.remorque_id),
      statut: asText(body.statut) ?? "planifiee",
      company_context: asText(body.company_context),
      notes: asText(body.notes),
      note_chauffeur: asText(body.note_chauffeur),
      commentaire_operationnel: asText(body.commentaire_operationnel),
      latitude,
      longitude,
      type_operation: asText(body.type_operation),
      ordre_arret: asInteger(body.ordre_arret),
      ...buildCreateStamp(user),
    };

    // Nettoyage : on retire les cles dont la valeur est explicitement undefined.
    // (Conserver les null permet d'ecraser des valeurs precedentes si besoin.)
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }

    const supabase = createAdminSupabaseClient();
    const insertRes = await supabase
      .from("livraisons_planifiees")
      .insert([payload])
      .select("*")
      .maybeSingle();

    if (insertRes.error) {
      const isMissingColumn =
        insertRes.error.code === "42703" ||
        insertRes.error.message.toLowerCase().includes("column") ||
        insertRes.error.message.toLowerCase().includes("schema cache");

      if (isMissingColumn) {
        // Fallback : on retire les colonnes optionnelles potentiellement absentes
        // de la base (ville/code_postal/province/notes/...) et on retente. Les
        // champs d'audit restent stampes meme dans ce cas.
        const minimalPayload: Record<string, unknown> = {
          dossier_id: payload.dossier_id,
          client: payload.client,
          adresse: payload.adresse,
          date_livraison: payload.date_livraison,
          heure_prevue: payload.heure_prevue,
          chauffeur_id: payload.chauffeur_id,
          vehicule_id: payload.vehicule_id,
          remorque_id: payload.remorque_id,
          statut: payload.statut,
          company_context: payload.company_context,
          type_operation: payload.type_operation,
          ordre_arret: payload.ordre_arret,
          ...buildCreateStamp(user),
        };
        for (const key of Object.keys(minimalPayload)) {
          if (minimalPayload[key] === undefined) delete minimalPayload[key];
        }
        const fallbackRes = await supabase
          .from("livraisons_planifiees")
          .insert([minimalPayload])
          .select("*")
          .maybeSingle();
        if (!fallbackRes.error && fallbackRes.data) {
          return NextResponse.json({
            success: true,
            inserted_row: fallbackRes.data,
            warning:
              "Insertion partielle : certaines colonnes optionnelles sont absentes du schema.",
          });
        }
        return NextResponse.json(
          {
            error: {
              message: insertRes.error.message,
              code: insertRes.error.code,
              details: insertRes.error.details,
              hint: insertRes.error.hint,
            },
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error: {
            message: insertRes.error.message,
            code: insertRes.error.code,
            details: insertRes.error.details,
            hint: insertRes.error.hint,
          },
        },
        { status: 400 }
      );
    }

    if (!insertRes.data) {
      return NextResponse.json(
        {
          error: {
            message:
              "Aucune ligne creee. Probable blocage RLS ou contrainte d'unicite.",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, inserted_row: insertRes.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors de la creation.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
