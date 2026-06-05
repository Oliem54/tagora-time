import { NextRequest, NextResponse } from "next/server";
import { loadChauffeurLabels, requireCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import { loadDirectionGrantedOperationalObjectives } from "@/app/lib/commissions/sales-book-grants.server";

export const dynamic = "force-dynamic";

function parseChauffeurId(raw: string) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chauffeurId: string }> }
) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { chauffeurId: rawChauffeurId } = await params;

    if (hasAdminFinanceAccess(user)) {
      return NextResponse.json(
        { error: "Utilisez les routes commissions admin pour la vue complete." },
        { status: 403 }
      );
    }

    const chauffeurId = parseChauffeurId(rawChauffeurId);
    if (chauffeurId == null) {
      return NextResponse.json({ error: "Identifiant employe invalide." }, { status: 400 });
    }

    const objectives = await loadDirectionGrantedOperationalObjectives(supabase, user.id, {
      chauffeurId,
    });

    if (objectives === "forbidden") {
      return NextResponse.json(
        { error: "Acces non autorise a ce livre de ventes." },
        { status: 403 }
      );
    }

    const labelMap = await loadChauffeurLabels(supabase, [chauffeurId]);

    return NextResponse.json({
      chauffeur_id: chauffeurId,
      chauffeur_label: labelMap.get(chauffeurId) ?? `Employe #${chauffeurId}`,
      objectives,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur livre autorise." },
      { status: 500 }
    );
  }
}
