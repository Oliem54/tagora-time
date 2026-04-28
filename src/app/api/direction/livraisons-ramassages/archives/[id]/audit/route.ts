import { NextRequest, NextResponse } from "next/server";
import { operationType, requireDirectionOrAdminApi } from "@/app/api/direction/livraisons-ramassages/archives/_lib";

type AuditRow = {
  id: number;
  dossier_id: number;
  dossier_type: "livraison" | "ramassage";
  action: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  details: Record<string, unknown> | null;
  document_id: string | null;
  document_name: string | null;
  created_at: string;
};

function asPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireDirectionOrAdminApi(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { id } = await params;
    const operationId = Number(id);
    if (!Number.isFinite(operationId) || operationId <= 0) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    const limit = Math.min(asPositiveInt(new URL(req.url).searchParams.get("limit"), 20), 100);
    const rowRes = await supabase
      .from("livraisons_planifiees")
      .select("id,type_operation")
      .eq("id", operationId)
      .maybeSingle();
    if (rowRes.error || !rowRes.data) {
      return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
    }

    const dossierType = operationType(rowRes.data as Record<string, string | number | null | undefined>);
    const auditRes = await supabase
      .from("livraison_ramassage_audit_logs")
      .select("*")
      .eq("dossier_id", operationId)
      .eq("dossier_type", dossierType)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (auditRes.error) {
      return NextResponse.json({ error: auditRes.error.message }, { status: 400 });
    }

    return NextResponse.json({
      items: (auditRes.data ?? []) as AuditRow[],
      dossierId: operationId,
      dossierType,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur historique.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
