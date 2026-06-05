import { NextRequest, NextResponse } from "next/server";
import { loadChauffeurLabels, requireCommissionsAccess } from "@/app/api/direction/commissions/_lib";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
import {
  loadActiveGrantOwnerChauffeurIds,
  loadDirectionGrantedOperationalObjectives,
} from "@/app/lib/commissions/sales-book-grants.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    if (hasAdminFinanceAccess(user)) {
      return NextResponse.json(
        { error: "Utilisez les routes commissions admin pour la vue complete." },
        { status: 403 }
      );
    }

    const grantedChauffeurIds = await loadActiveGrantOwnerChauffeurIds(supabase, user.id);
    const objectivesResult = await loadDirectionGrantedOperationalObjectives(supabase, user.id);
    const objectives = objectivesResult === "forbidden" ? [] : objectivesResult;
    const labelMap = await loadChauffeurLabels(supabase, grantedChauffeurIds);

    const books = grantedChauffeurIds.map((chauffeurId) => ({
      chauffeur_id: chauffeurId,
      chauffeur_label: labelMap.get(chauffeurId) ?? `Employe #${chauffeurId}`,
      objectives: objectives.filter((item) => item.chauffeur_id === chauffeurId),
    }));

    return NextResponse.json({ books, granted_chauffeur_ids: grantedChauffeurIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur livres autorises." },
      { status: 500 }
    );
  }
}
