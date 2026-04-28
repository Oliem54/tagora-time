import { NextRequest, NextResponse } from "next/server";
import {
  type ArchiveRow,
  type ProofRow,
  firstText,
  logArchiveAction,
  operationType,
  requireDirectionOrAdminApi,
  toArchiveEntry,
} from "@/app/api/direction/livraisons-ramassages/archives/_lib";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdminApi(req);
    if (!auth.ok) return auth.response;
    const { supabase, user, role } = auth;

    const { id } = await params;
    const operationId = Number(id);
    if (!Number.isFinite(operationId) || operationId <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const rowRes = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("id", operationId)
      .maybeSingle();
    if (rowRes.error || !rowRes.data) {
      return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    }

    const row = rowRes.data as ArchiveRow;
    const type = operationType(row);

    const [dossiersRes, chauffeursRes, vehiculesRes, remorquesRes, proofsRes] =
      await Promise.all([
        Number.isFinite(Number(row.dossier_id))
          ? supabase.from("dossiers").select("*").eq("id", Number(row.dossier_id)).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        Number.isFinite(Number(row.chauffeur_id))
          ? supabase.from("chauffeurs").select("*").eq("id", Number(row.chauffeur_id)).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        Number.isFinite(Number(row.vehicule_id))
          ? supabase.from("vehicules").select("*").eq("id", Number(row.vehicule_id)).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        Number.isFinite(Number(row.remorque_id))
          ? supabase.from("remorques").select("*").eq("id", Number(row.remorque_id)).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("operation_proofs")
          .select("*")
          .eq("module_source", type)
          .eq("source_id", String(operationId))
          .order("date_heure", { ascending: false }),
      ]);

    const dossiersById = new Map<number, ArchiveRow>();
    if (dossiersRes.data) dossiersById.set(Number((dossiersRes.data as ArchiveRow).id), dossiersRes.data as ArchiveRow);
    const chauffeursById = new Map<number, ArchiveRow>();
    if (chauffeursRes.data) chauffeursById.set(Number((chauffeursRes.data as ArchiveRow).id), chauffeursRes.data as ArchiveRow);
    const vehiculesById = new Map<number, ArchiveRow>();
    if (vehiculesRes.data) vehiculesById.set(Number((vehiculesRes.data as ArchiveRow).id), vehiculesRes.data as ArchiveRow);
    const remorquesById = new Map<number, ArchiveRow>();
    if (remorquesRes.data) remorquesById.set(Number((remorquesRes.data as ArchiveRow).id), remorquesRes.data as ArchiveRow);
    const proofCountByKey = new Map<string, number>([[`${type}:${operationId}`, ((proofsRes.data ?? []) as unknown[]).length]]);

    const entry = toArchiveEntry(row, {
      dossiersById,
      chauffeursById,
      vehiculesById,
      remorquesById,
      proofCountByKey,
    });

    const dossier = dossiersRes.data as ArchiveRow | null;
    const detail = {
      ...entry,
      realDate: firstText(row, ["date_reelle", "date_effective"]),
      departureTime: firstText(row, ["heure_depart"]),
      arrivalTime: firstText(row, ["heure_arrivee"]),
      kmDepart: firstText(row, ["kilometrage_depart", "km_depart"]),
      kmArrivee: firstText(row, ["kilometrage_arrivee", "km_arrivee"]),
      internalNotes: firstText(row, ["notes_internes", "notes"]),
      driverNotes: firstText(row, ["notes_chauffeur"]),
      history: firstText(row, ["historique_modifications"]),
      dossierLabel:
        firstText(dossier ?? undefined, ["nom", "reference", "numero"]) ||
        (Number.isFinite(Number(row.dossier_id)) ? `#${Number(row.dossier_id)}` : ""),
      proofs: ((proofsRes.data ?? []) as ProofRow[]).map((proof) => ({
        ...proof,
      })),
    };

    await logArchiveAction({
      req,
      supabase,
      dossierId: operationId,
      dossierType: type,
      action: "view_dossier",
      user,
      role,
      details: {
        proofCount: detail.proofs.length,
      },
    });

    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur detail archive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
