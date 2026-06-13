import { NextRequest, NextResponse } from "next/server";
import { loadChauffeurProfiles, requireCommissionsAccess } from "@/app/api/direction/commissions/_lib";
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

    const profileMap = await loadChauffeurProfiles(supabase, [chauffeurId]);
    const profile = profileMap.get(chauffeurId);

    return NextResponse.json({
      chauffeur_id: chauffeurId,
      chauffeur_label: profile?.label ?? `Employé #${chauffeurId}`,
      chauffeur_nom: profile?.nom ?? null,
      chauffeur_courriel: profile?.courriel ?? null,
      objectives,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur livre autorise." },
      { status: 500 }
    );
  }
}
