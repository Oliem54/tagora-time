import { NextRequest, NextResponse } from "next/server";
import {
  type ArchiveRow,
  requireDirectionOrAdminApi,
  toArchiveEntry,
} from "@/app/api/direction/livraisons-ramassages/archives/_lib";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function asPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireDirectionOrAdminApi(req);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "").trim();
    const client = (searchParams.get("client") ?? "").trim();
    const dateDebut = (searchParams.get("dateDebut") ?? "").trim();
    const dateFin = (searchParams.get("dateFin") ?? "").trim();
    const commande = (searchParams.get("commande") ?? "").trim();
    const facture = (searchParams.get("facture") ?? "").trim();
    const chauffeur = (searchParams.get("chauffeur") ?? "").trim();
    const vehicule = (searchParams.get("vehicule") ?? "").trim();
    const remorque = (searchParams.get("remorque") ?? "").trim();
    const statut = (searchParams.get("statut") ?? "").trim();
    const entreprise = (searchParams.get("entreprise") ?? "").trim();
    const adresse = (searchParams.get("adresse") ?? "").trim();
    const search = (searchParams.get("search") ?? "").trim();
    const page = asPositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(asPositiveInt(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const chauffeurIds: number[] = [];
    if (chauffeur) {
      const chauffeurRes = await supabase
        .from("chauffeurs")
        .select("id")
        .or(`nom.ilike.%${chauffeur}%,prenom.ilike.%${chauffeur}%,nom_complet.ilike.%${chauffeur}%`)
        .limit(300);
      if (chauffeurRes.error) {
        return NextResponse.json({ error: chauffeurRes.error.message }, { status: 400 });
      }
      (chauffeurRes.data ?? []).forEach((item) => {
        const id = Number((item as { id?: unknown }).id);
        if (Number.isFinite(id)) chauffeurIds.push(id);
      });
      if (chauffeurIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit });
      }
    }

    const vehiculeIds: number[] = [];
    if (vehicule) {
      const vehiculeRes = await supabase
        .from("vehicules")
        .select("id")
        .or(`nom.ilike.%${vehicule}%,modele.ilike.%${vehicule}%,plaque.ilike.%${vehicule}%`)
        .limit(300);
      if (vehiculeRes.error) {
        return NextResponse.json({ error: vehiculeRes.error.message }, { status: 400 });
      }
      (vehiculeRes.data ?? []).forEach((item) => {
        const id = Number((item as { id?: unknown }).id);
        if (Number.isFinite(id)) vehiculeIds.push(id);
      });
      if (vehiculeIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit });
      }
    }

    const remorqueIds: number[] = [];
    if (remorque) {
      const remorqueRes = await supabase
        .from("remorques")
        .select("id")
        .or(`nom.ilike.%${remorque}%,modele.ilike.%${remorque}%,plaque.ilike.%${remorque}%`)
        .limit(300);
      if (remorqueRes.error) {
        return NextResponse.json({ error: remorqueRes.error.message }, { status: 400 });
      }
      (remorqueRes.data ?? []).forEach((item) => {
        const id = Number((item as { id?: unknown }).id);
        if (Number.isFinite(id)) remorqueIds.push(id);
      });
      if (remorqueIds.length === 0) {
        return NextResponse.json({ items: [], total: 0, page, limit });
      }
    }

    const dossierIds = new Set<number>();
    if (commande || facture || search) {
      let dossierQuery = supabase.from("dossiers").select("id, nom, client, reference, numero").limit(1000);
      if (commande) {
        dossierQuery = dossierQuery.or(`reference.ilike.%${commande}%,numero.ilike.%${commande}%`);
      }
      if (facture) {
        dossierQuery = dossierQuery.or(`reference.ilike.%${facture}%,numero.ilike.%${facture}%`);
      }
      if (search) {
        dossierQuery = dossierQuery.or(`nom.ilike.%${search}%,client.ilike.%${search}%,reference.ilike.%${search}%,numero.ilike.%${search}%`);
      }
      const dossierRes = await dossierQuery;
      if (!dossierRes.error) {
        (dossierRes.data ?? []).forEach((item) => {
          const id = Number((item as { id?: unknown }).id);
          if (Number.isFinite(id)) dossierIds.add(id);
        });
      }
    }

    let query = supabase
      .from("livraisons_planifiees")
      .select("*", { count: "exact" })
      .order("id", { ascending: false });

    if (type === "livraison") query = query.or("type_operation.eq.livraison_client,type_operation.is.null");
    if (type === "ramassage") query = query.eq("type_operation", "ramassage_client");
    if (statut) query = query.eq("statut", statut);
    if (entreprise) query = query.eq("company_context", entreprise);
    if (dateDebut) query = query.gte("date_livraison", dateDebut);
    if (dateFin) query = query.lte("date_livraison", dateFin);
    if (client) query = query.ilike("client", `%${client}%`);
    if (adresse) query = query.ilike("adresse", `%${adresse}%`);
    if (search) {
      query = query.or(
        `client.ilike.%${search}%,adresse.ilike.%${search}%,statut.ilike.%${search}%,id.eq.${Number.isFinite(Number(search)) ? Number(search) : -1}`
      );
    }
    if (chauffeurIds.length > 0) query = query.in("chauffeur_id", chauffeurIds);
    if (vehiculeIds.length > 0) query = query.in("vehicule_id", vehiculeIds);
    if (remorqueIds.length > 0) query = query.in("remorque_id", remorqueIds);
    if (dossierIds.size > 0) query = query.in("dossier_id", Array.from(dossierIds));

    const listRes = await query.range(from, to);
    if (listRes.error) {
      return NextResponse.json({ error: listRes.error.message }, { status: 400 });
    }

    const rows = (listRes.data ?? []) as ArchiveRow[];
    const total = listRes.count ?? 0;

    const dossierIdList = rows
      .map((item) => Number(item.dossier_id))
      .filter((id) => Number.isFinite(id));
    const chauffeurIdList = rows
      .map((item) => Number(item.chauffeur_id))
      .filter((id) => Number.isFinite(id));
    const vehiculeIdList = rows
      .map((item) => Number(item.vehicule_id))
      .filter((id) => Number.isFinite(id));
    const remorqueIdList = rows
      .map((item) => Number(item.remorque_id))
      .filter((id) => Number.isFinite(id));

    const [dossiersRes, chauffeursRes, vehiculesRes, remorquesRes] = await Promise.all([
      dossierIdList.length
        ? supabase.from("dossiers").select("*").in("id", dossierIdList)
        : Promise.resolve({ data: [], error: null }),
      chauffeurIdList.length
        ? supabase.from("chauffeurs").select("*").in("id", chauffeurIdList)
        : Promise.resolve({ data: [], error: null }),
      vehiculeIdList.length
        ? supabase.from("vehicules").select("*").in("id", vehiculeIdList)
        : Promise.resolve({ data: [], error: null }),
      remorqueIdList.length
        ? supabase.from("remorques").select("*").in("id", remorqueIdList)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const dossiersById = new Map<number, ArchiveRow>();
    ((dossiersRes.data ?? []) as ArchiveRow[]).forEach((item) => {
      const id = Number(item.id);
      if (Number.isFinite(id)) dossiersById.set(id, item);
    });
    const chauffeursById = new Map<number, ArchiveRow>();
    ((chauffeursRes.data ?? []) as ArchiveRow[]).forEach((item) => {
      const id = Number(item.id);
      if (Number.isFinite(id)) chauffeursById.set(id, item);
    });
    const vehiculesById = new Map<number, ArchiveRow>();
    ((vehiculesRes.data ?? []) as ArchiveRow[]).forEach((item) => {
      const id = Number(item.id);
      if (Number.isFinite(id)) vehiculesById.set(id, item);
    });
    const remorquesById = new Map<number, ArchiveRow>();
    ((remorquesRes.data ?? []) as ArchiveRow[]).forEach((item) => {
      const id = Number(item.id);
      if (Number.isFinite(id)) remorquesById.set(id, item);
    });

    const livraisonIds = rows.filter((row) => row.type_operation !== "ramassage_client").map((row) => String(row.id));
    const ramassageIds = rows.filter((row) => row.type_operation === "ramassage_client").map((row) => String(row.id));
    const proofCountByKey = new Map<string, number>();

    if (livraisonIds.length > 0) {
      const proofsRes = await supabase
        .from("operation_proofs")
        .select("module_source, source_id")
        .eq("module_source", "livraison")
        .in("source_id", livraisonIds);
      if (!proofsRes.error) {
        ((proofsRes.data ?? []) as Array<{ module_source: string; source_id: string }>).forEach((proof) => {
          const key = `${proof.module_source}:${proof.source_id}`;
          proofCountByKey.set(key, (proofCountByKey.get(key) ?? 0) + 1);
        });
      }
    }
    if (ramassageIds.length > 0) {
      const proofsRes = await supabase
        .from("operation_proofs")
        .select("module_source, source_id")
        .eq("module_source", "ramassage")
        .in("source_id", ramassageIds);
      if (!proofsRes.error) {
        ((proofsRes.data ?? []) as Array<{ module_source: string; source_id: string }>).forEach((proof) => {
          const key = `${proof.module_source}:${proof.source_id}`;
          proofCountByKey.set(key, (proofCountByKey.get(key) ?? 0) + 1);
        });
      }
    }

    const items = rows.map((row) =>
      toArchiveEntry(row, {
        dossiersById,
        chauffeursById,
        vehiculesById,
        remorquesById,
        proofCountByKey,
      })
    );

    const contactSearch = (searchParams.get("contact") ?? "").trim();
    const finalItems = contactSearch
      ? items.filter((item) =>
          `${item.phone} ${item.email}`.toLowerCase().includes(contactSearch.toLowerCase())
        )
      : items;

    return NextResponse.json({
      items: finalItems,
      total,
      page,
      limit,
      serverFiltersApplied: {
        type,
        client: Boolean(client),
        dateDebut: Boolean(dateDebut),
        dateFin: Boolean(dateFin),
        commande: Boolean(commande),
        facture: Boolean(facture),
        chauffeur: Boolean(chauffeur),
        vehicule: Boolean(vehicule),
        remorque: Boolean(remorque),
        statut: Boolean(statut),
        entreprise: Boolean(entreprise),
        adresse: Boolean(adresse),
        search: Boolean(search),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur archives.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
