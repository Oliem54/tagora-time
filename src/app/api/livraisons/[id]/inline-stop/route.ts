import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import { buildUpdateStamp } from "@/app/lib/livraisons/audit-stamp.server";
import {
  gateFinalizationAfterMerge,
  mergePaymentConfirmationFromRequest,
  normalizePaymentBalanceDue,
} from "@/app/lib/livraisons/livraison-payment.server";

type InlineStopPayload = {
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
  statut?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  note_chauffeur?: unknown;
  commentaire_operationnel?: unknown;
  item_location?: unknown;
  pickup_address?: unknown;
  payment_status?: unknown;
  payment_balance_due?: unknown;
  payment_method?: unknown;
  payment_note?: unknown;
};

type InlineStopCorePayload = {
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  postal_code: string | null;
  province: string | null;
  contact_name: string | null;
  contact_phone_primary: string | null;
  contact_phone_primary_ext: string | null;
  contact_phone_secondary: string | null;
  contact_phone_secondary_ext: string | null;
  date_livraison: string | null;
  heure_prevue: string | null;
  statut: string | null;
  latitude: number | null;
  longitude: number | null;
  note_chauffeur: string | null;
  commentaire_operationnel: string | null;
  item_location: string | null;
  pickup_address: string | null;
};

type LivraisonInlineRow = {
  id: number;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  postal_code: string | null;
  province: string | null;
  contact_name: string | null;
  contact_phone_primary: string | null;
  contact_phone_primary_ext: string | null;
  contact_phone_secondary: string | null;
  contact_phone_secondary_ext: string | null;
  date_livraison: string | null;
  heure_prevue: string | null;
  statut: string | null;
  latitude: number | null;
  longitude: number | null;
  note_chauffeur: string | null;
  commentaire_operationnel: string | null;
  item_location: string | null;
  pickup_address: string | null;
  payment_status: string | null;
  payment_balance_due: number | string | null;
  payment_method: string | null;
  payment_note: string | null;
  payment_confirmed_at: string | null;
  payment_confirmed_by_user_id: string | null;
  payment_confirmed_by_name: string | null;
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
  "id, adresse, ville, code_postal, postal_code, province, contact_name, contact_phone_primary, contact_phone_primary_ext, contact_phone_secondary, contact_phone_secondary_ext, date_livraison, heure_prevue, statut, latitude, longitude, note_chauffeur, commentaire_operationnel, item_location, pickup_address, payment_status, payment_balance_due, payment_method, payment_note, payment_confirmed_at, payment_confirmed_by_user_id, payment_confirmed_by_name, created_by_user_id, created_by_name, scheduled_by_user_id, scheduled_by_name, updated_by_user_id, updated_by_name, created_at, updated_at";

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

    const raw = (await req.json()) as Record<string, unknown>;
    const body = raw as unknown as InlineStopPayload;

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

    const codePostal = asNullableText(body.code_postal) ?? asNullableText(body.postal_code);
    const postalCode = asNullableText(body.postal_code) ?? codePostal;

    const corePayload: InlineStopCorePayload = {
      adresse: asNullableText(body.adresse),
      ville: asNullableText(body.ville),
      code_postal: codePostal,
      postal_code: postalCode,
      province: asNullableText(body.province),
      contact_name: asNullableText(body.contact_name),
      contact_phone_primary: asNullableText(body.contact_phone_primary),
      contact_phone_primary_ext: asNullableText(body.contact_phone_primary_ext),
      contact_phone_secondary: asNullableText(body.contact_phone_secondary),
      contact_phone_secondary_ext: asNullableText(body.contact_phone_secondary_ext),
      date_livraison: asNullableText(body.date_livraison),
      heure_prevue: asNullableText(body.heure_prevue),
      statut: asNullableText(body.statut),
      latitude,
      longitude,
      note_chauffeur: asNullableText(body.note_chauffeur),
      commentaire_operationnel: asNullableText(body.commentaire_operationnel),
      item_location: asNullableText(body.item_location),
      pickup_address: asNullableText(body.pickup_address),
    };

    const paymentPatch: Record<string, unknown> = {};
    if ("payment_status" in raw) {
      paymentPatch.payment_status = asNullableText(raw.payment_status);
    }
    if ("payment_balance_due" in raw && raw.payment_balance_due != null && raw.payment_balance_due !== "") {
      const n = Number(raw.payment_balance_due);
      paymentPatch.payment_balance_due = Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }
    if ("payment_method" in raw) {
      paymentPatch.payment_method = asNullableText(raw.payment_method);
    }
    if ("payment_note" in raw) {
      paymentPatch.payment_note = asNullableText(raw.payment_note);
    }

    const paymentConfirmed = raw.payment_confirmed === true;
    const confirmationMethod =
      typeof raw.payment_method === "string" ? raw.payment_method.trim() : "";

    const supabase = createAdminSupabaseClient();
    const { data: currentRow, error: currentErr } = await supabase
      .from("livraisons_planifiees")
      .select("statut, payment_status, payment_balance_due, type_operation")
      .eq("id", livraisonId)
      .maybeSingle<{
        statut: string | null;
        payment_status: string | null;
        payment_balance_due: number | string | null;
        type_operation: string | null;
      }>();

    if (currentErr) {
      return NextResponse.json(
        { error: { message: currentErr.message } },
        { status: 400 }
      );
    }
    if (!currentRow) {
      return NextResponse.json({ error: { message: "Livraison introuvable." } }, { status: 404 });
    }

    const mergedPayment = mergePaymentConfirmationFromRequest(raw, paymentPatch, user);
    if (mergedPayment.error) {
      return NextResponse.json(
        { error: { message: mergedPayment.error.message } },
        { status: mergedPayment.error.status }
      );
    }

    const mergeForGate: Record<string, unknown> = { ...mergedPayment.merge };
    if ("statut" in raw) {
      mergeForGate.statut = corePayload.statut;
    }
    if (!("statut" in mergeForGate) || mergeForGate.statut === undefined) {
      mergeForGate.statut = currentRow.statut;
    }
    mergeForGate.payment_balance_due =
      mergedPayment.merge.payment_balance_due !== undefined
        ? normalizePaymentBalanceDue(mergedPayment.merge.payment_balance_due)
        : normalizePaymentBalanceDue(currentRow.payment_balance_due);

    const gate = gateFinalizationAfterMerge({
      currentStatut: currentRow.statut,
      currentBalanceDue: currentRow.payment_balance_due,
      currentTypeOperation: currentRow.type_operation,
      mergePatch: mergeForGate,
      paymentConfirmed,
      confirmationMethodTrimmed: confirmationMethod,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: { message: gate.message } }, { status: gate.httpStatus });
    }

    const rowUpdate = {
      ...corePayload,
      ...mergedPayment.merge,
      ...buildUpdateStamp(user),
    };

    const updateRes = await supabase
      .from("livraisons_planifiees")
      .update(rowUpdate)
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
          rowUpdate
        ),
        { status: 409 }
      );
    }

    const updateError = updateRes.error;
    if (!updateError) {
      return NextResponse.json(
        buildErrorBody("Echec update inline-stop.", rowUpdate),
        { status: 400 }
      );
    }

    const mentionsMissingColumn =
      updateError.code === "42703" ||
      updateError.message.toLowerCase().includes("column") ||
      updateError.message.toLowerCase().includes("schema cache");

    if (mentionsMissingColumn) {
      const fallbackPayload = { adresse: corePayload.adresse };
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
            payload: rowUpdate,
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

    return NextResponse.json(buildErrorBody("Echec update inline-stop.", rowUpdate, updateError), {
      status: 400,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur inline-stop.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
