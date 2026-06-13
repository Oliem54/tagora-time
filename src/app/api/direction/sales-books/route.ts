import { NextRequest, NextResponse } from "next/server";
import { loadChauffeurProfiles, requireCommissionsAccess } from "@/app/api/direction/commissions/_lib";
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

    const grantedChauffeurIds = await loadActiveGrantOwnerChauffeurIds(supabase, user.id);
    const objectivesResult = await loadDirectionGrantedOperationalObjectives(supabase, user.id);
    const objectives = objectivesResult === "forbidden" ? [] : objectivesResult;
    const profileMap = await loadChauffeurProfiles(supabase, grantedChauffeurIds);

    const books = grantedChauffeurIds.map((chauffeurId) => {
      const profile = profileMap.get(chauffeurId);
      return {
        chauffeur_id: chauffeurId,
        chauffeur_label: profile?.label ?? `Employé #${chauffeurId}`,
        chauffeur_nom: profile?.nom ?? null,
        chauffeur_courriel: profile?.courriel ?? null,
        objectives: objectives.filter((item) => item.chauffeur_id === chauffeurId),
      };
    });

    return NextResponse.json({ books, granted_chauffeur_ids: grantedChauffeurIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur livres autorises." },
      { status: 500 }
    );
  }
}
