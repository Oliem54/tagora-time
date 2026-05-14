import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildCreateStamp } from "@/app/lib/livraisons/audit-stamp.server";
import { resolvePaymentForCreate } from "@/app/lib/livraisons/livraison-payment.server";
import { DEFAULT_RAMASSAGE_PICKUP_ADDRESS } from "@/app/lib/livraisons/ramassage-defaults.server";
import { geocodeInCanada } from "@/app/lib/geocode-nominatim.server";

type LivraisonCreatePayload = {
  dossier_id?: unknown;
  client?: unknown;
  adresse?: unknown;
  ville?: unknown;
  code_postal?: unknown;
  postal_code?: unknown;
  province?: unknown;
  contact_name?: unknown;
  contact_phone_primary?: unknown;
  contact_phone_primary_ext?: unknown;
  contact_phone_secondary?: unknown;
  contact_phone_secondary_ext?: unknown;
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
  item_location?: unknown;
  pickup_address?: unknown;
  payment_client_paid_full?: unknown;
  payment_status?: unknown;
  payment_balance_due?: unknown;
  payment_method?: unknown;
  payment_note?: unknown;
};

/** Colonnes connues de livraisons_planifiees (repo). Ne jamais inserer hors liste. */
const INSERT_COLUMN_KEYS = [
  "dossier_id",
  "client",
  "adresse",
  "ville",
  "code_postal",
  "postal_code",
  "province",
  "contact_name",
  "contact_phone_primary",
  "contact_phone_primary_ext",
  "contact_phone_secondary",
  "contact_phone_secondary_ext",
  "date_livraison",
  "heure_prevue",
  "chauffeur_id",
  "vehicule_id",
  "remorque_id",
  "statut",
  "company_context",
  "notes",
  "note_chauffeur",
  "commentaire_operationnel",
  "latitude",
  "longitude",
  "type_operation",
  "ordre_arret",
  "item_location",
  "pickup_address",
  "payment_status",
  "payment_balance_due",
  "payment_method",
  "payment_note",
  "created_by_user_id",
  "created_by_name",
  "scheduled_by_user_id",
  "scheduled_by_name",
  "updated_by_user_id",
  "updated_by_name",
  "created_at",
  "updated_at",
] as const;

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

function pickInsertPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of INSERT_COLUMN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      const v = raw[key];
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
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

    const typeOperation = asText(body.type_operation) ?? "livraison_client";
    const isRamassageClient = typeOperation === "ramassage_client";

    const adresse = asText(body.adresse);
    const codePostal = asText(body.code_postal) ?? asText(body.postal_code);
    if (!adresse) {
      return NextResponse.json(
        { error: { message: "Adresse requise pour creer la livraison." } },
        { status: 400 }
      );
    }
    if (!codePostal) {
      return NextResponse.json(
        { error: { message: "Code postal requis pour creer la livraison." } },
        { status: 400 }
      );
    }

    const itemLocation = asText(body.item_location);
    const pickupAddress =
      isRamassageClient && !asText(body.pickup_address)
        ? DEFAULT_RAMASSAGE_PICKUP_ADDRESS
        : asText(body.pickup_address);

    let paymentRow: Record<string, unknown>;
    try {
      paymentRow = resolvePaymentForCreate(body) as unknown as Record<string, unknown>;
    } catch (paymentError) {
      const msg =
        paymentError instanceof Error ? paymentError.message : "Paiement client invalide.";
      return NextResponse.json({ error: { message: msg } }, { status: 400 });
    }

    let latitude = asFloat(body.latitude);
    let longitude = asFloat(body.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      const geoQuery = `${adresse}, ${codePostal}, Canada`;
      const geo = await geocodeInCanada(geoQuery);
      if (!geo) {
        return NextResponse.json(
          {
            error: {
              message:
                "Geocodage impossible pour cette adresse. Verifiez l'adresse et le code postal.",
            },
          },
          { status: 400 }
        );
      }
      latitude = geo.latitude;
      longitude = geo.longitude;
    }

    const rawRow: Record<string, unknown> = {
      dossier_id: asInteger(body.dossier_id),
      client: asText(body.client),
      adresse,
      ville: asText(body.ville),
      code_postal: codePostal,
      postal_code: codePostal,
      province: asText(body.province),
      contact_name: asText(body.contact_name),
      contact_phone_primary: asText(body.contact_phone_primary),
      contact_phone_primary_ext: asText(body.contact_phone_primary_ext),
      contact_phone_secondary: asText(body.contact_phone_secondary),
      contact_phone_secondary_ext: asText(body.contact_phone_secondary_ext),
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
      type_operation: typeOperation,
      ordre_arret: asInteger(body.ordre_arret),
      item_location: itemLocation,
      pickup_address: pickupAddress,
      ...paymentRow,
      ...buildCreateStamp(user),
    };

    for (const key of Object.keys(rawRow)) {
      if (rawRow[key] === undefined) delete rawRow[key];
    }

    const payload = pickInsertPayload(rawRow);

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
        const minimalPayload: Record<string, unknown> = {
          dossier_id: payload.dossier_id,
          client: payload.client,
          adresse: payload.adresse,
          code_postal: payload.code_postal,
          postal_code: payload.postal_code,
          company_context: payload.company_context,
          contact_name: payload.contact_name,
          contact_phone_primary: payload.contact_phone_primary,
          contact_phone_primary_ext: payload.contact_phone_primary_ext,
          contact_phone_secondary: payload.contact_phone_secondary,
          contact_phone_secondary_ext: payload.contact_phone_secondary_ext,
          date_livraison: payload.date_livraison,
          heure_prevue: payload.heure_prevue,
          chauffeur_id: payload.chauffeur_id,
          vehicule_id: payload.vehicule_id,
          remorque_id: payload.remorque_id,
          statut: payload.statut,
          type_operation: payload.type_operation ?? "livraison_client",
          ordre_arret: payload.ordre_arret,
          item_location: payload.item_location,
          pickup_address: payload.pickup_address,
          payment_status: payload.payment_status,
          payment_balance_due: payload.payment_balance_due,
          payment_method: payload.payment_method,
          payment_note: payload.payment_note,
          latitude: payload.latitude,
          longitude: payload.longitude,
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
