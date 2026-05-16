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
import {
  parsePaymentFromRow,
  stripPaymentDbColumns,
} from "@/app/lib/livraisons/payment-embed";

// Champs autorises a etre mis a jour via cette API generique.
// Note : les champs d'audit (created_by_*, scheduled_by_*) ne peuvent pas etre
// reecrits cote client. updated_by_* et updated_at sont stampes automatiquement.
const ALLOWED_UPDATE_FIELDS = new Set([
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
  "note_chauffeur",
  "commentaire_operationnel",
  "latitude",
  "longitude",
  "type_operation",
  "ordre_arret",
  "item_location",
  "pickup_address",
]);

function effectiveBalanceDue(
  current: Record<string, unknown>,
  mergePatch: Record<string, unknown>
): number {
  if (mergePatch.commentaire_operationnel !== undefined) {
    return parsePaymentFromRow({
      ...current,
      commentaire_operationnel: mergePatch.commentaire_operationnel,
    }).payment_balance_due;
  }
  if (mergePatch.payment_balance_due !== undefined) {
    return normalizePaymentBalanceDue(mergePatch.payment_balance_due);
  }
  return parsePaymentFromRow(current).payment_balance_due;
}

type AnyRecord = Record<string, unknown>;

function sanitizePayload(input: AnyRecord) {
  const payload: AnyRecord = {};
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) {
      ignored.push(key);
      continue;
    }
    // Conversion legere pour les champs numeriques connus
    if (
      (key === "dossier_id" ||
        key === "chauffeur_id" ||
        key === "vehicule_id" ||
        key === "remorque_id" ||
        key === "ordre_arret") &&
      value != null &&
      value !== ""
    ) {
      const parsed = Number(value);
      payload[key] = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
      continue;
    }
    if ((key === "latitude" || key === "longitude") && value != null && value !== "") {
      const parsed = Number(value);
      payload[key] = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    payload[key] = value === "" ? null : value;
  }
  return { payload, ignored };
}

/**
 * PATCH /api/livraisons/[id]
 * Met a jour une livraison existante.
 * Stamp automatiquement updated_by_user_id, updated_by_name et updated_at.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json(
        { error: { message: "Identifiant livraison invalide." } },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    const paymentConfirmed = body.payment_confirmed === true;
    const confirmationMethod =
      typeof body.payment_method === "string" ? body.payment_method.trim() : "";

    const { payload, ignored } = sanitizePayload(body);

    if ("postal_code" in payload && !("code_postal" in payload)) {
      payload.code_postal = payload.postal_code;
    }
    if ("code_postal" in payload && !("postal_code" in payload)) {
      payload.postal_code = payload.code_postal;
    }

    if (Object.keys(payload).length === 0 && !paymentConfirmed) {
      return NextResponse.json(
        {
          error: {
            message: "Aucun champ valide fourni.",
            ignored,
          },
        },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: currentRow, error: currentErr } = await supabase
      .from("livraisons_planifiees")
      .select("statut, commentaire_operationnel, type_operation")
      .eq("id", livraisonId)
      .maybeSingle<{
        statut: string | null;
        commentaire_operationnel: string | null;
        type_operation: string | null;
      }>();

    if (currentErr) {
      console.error("[api/livraisons/[id] PATCH] load current", { livraisonId, currentErr });
      return NextResponse.json(
        { error: { message: currentErr.message } },
        { status: 400 }
      );
    }
    if (!currentRow) {
      return NextResponse.json(
        { error: { message: "Livraison introuvable." } },
        { status: 404 }
      );
    }

    const mergedPayment = mergePaymentConfirmationFromRequest(body, payload, user);
    if (mergedPayment.error) {
      return NextResponse.json(
        { error: { message: mergedPayment.error.message } },
        { status: mergedPayment.error.status }
      );
    }

    const currentRecord = currentRow as Record<string, unknown>;
    const gatePatch = {
      ...mergedPayment.merge,
      payment_balance_due: effectiveBalanceDue(currentRecord, mergedPayment.merge),
    };
    const gate = gateFinalizationAfterMerge({
      currentStatut: currentRow.statut,
      currentBalanceDue: parsePaymentFromRow(currentRecord).payment_balance_due,
      currentTypeOperation: currentRow.type_operation,
      mergePatch: gatePatch,
      paymentConfirmed,
      confirmationMethodTrimmed: confirmationMethod,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: { message: gate.message } }, { status: gate.httpStatus });
    }

    const dbPatch = stripPaymentDbColumns(mergedPayment.merge);
    const stampedPayload = { ...dbPatch, ...buildUpdateStamp(user) };

    let updateRes = await supabase
      .from("livraisons_planifiees")
      .update(stampedPayload)
      .eq("id", livraisonId)
      .select("*")
      .maybeSingle();

    let auditWarning: string | undefined;

    // Fallback : si la migration d'audit n'a pas encore ete appliquee, on retente
    // sans les colonnes d'audit pour ne pas casser les Actions rapides.
    if (
      updateRes.error &&
      (updateRes.error.code === "42703" ||
        (typeof updateRes.error.message === "string" &&
          updateRes.error.message.toLowerCase().includes("column") &&
          (updateRes.error.message.toLowerCase().includes("updated_by") ||
            updateRes.error.message.toLowerCase().includes("updated_at") ||
            updateRes.error.message.toLowerCase().includes("schema cache"))))
    ) {
      console.warn(
        "[api/livraisons/[id] PATCH] audit columns missing, retrying without stamp",
        {
          livraisonId,
          code: updateRes.error.code,
          message: updateRes.error.message,
        }
      );
      updateRes = await supabase
        .from("livraisons_planifiees")
        .update(dbPatch)
        .eq("id", livraisonId)
        .select("*")
        .maybeSingle();
      auditWarning =
        "Colonnes d'audit absentes. Appliquer la migration 20260513_103000_livraisons_planifiees_user_audit.sql pour activer le suivi 'Programme par / Modifie par'.";
    }

    if (updateRes.error) {
      console.error("[api/livraisons/[id] PATCH] db error", {
        livraisonId,
        payload: stampedPayload,
        code: updateRes.error.code,
        message: updateRes.error.message,
        details: updateRes.error.details,
        hint: updateRes.error.hint,
      });
      return NextResponse.json(
        {
          error: {
            message: updateRes.error.message,
            code: updateRes.error.code,
            details: updateRes.error.details,
            hint: updateRes.error.hint,
          },
        },
        { status: 400 }
      );
    }

    if (!updateRes.data) {
      console.warn("[api/livraisons/[id] PATCH] no row updated", { livraisonId });
      return NextResponse.json(
        {
          error: {
            message: "Aucune ligne mise a jour. Verifier l'identifiant ou les regles RLS.",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_row: updateRes.data,
      ignored: ignored.length > 0 ? ignored : undefined,
      warning: auditWarning,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors de la mise a jour.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

/**
 * DELETE /api/livraisons/[id]
 * Supprime une livraison. Reserve aux administrateurs.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { error: { message: "Suppression reservee a la direction/admin." } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const livraisonId = Number(id);
    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json(
        { error: { message: "Identifiant livraison invalide." } },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const deleteRes = await supabase
      .from("livraisons_planifiees")
      .delete()
      .eq("id", livraisonId)
      .select("id")
      .maybeSingle();

    if (deleteRes.error) {
      console.error("[api/livraisons/[id] DELETE] db error", {
        livraisonId,
        code: deleteRes.error.code,
        message: deleteRes.error.message,
        details: deleteRes.error.details,
        hint: deleteRes.error.hint,
      });
      return NextResponse.json(
        {
          error: {
            message: deleteRes.error.message,
            code: deleteRes.error.code,
            details: deleteRes.error.details,
            hint: deleteRes.error.hint,
          },
        },
        { status: 400 }
      );
    }

    if (!deleteRes.data) {
      return NextResponse.json(
        {
          error: {
            message: "Aucune ligne supprimee. Verifier l'identifiant ou les regles RLS.",
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, deleted_id: deleteRes.data.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur lors de la suppression.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
