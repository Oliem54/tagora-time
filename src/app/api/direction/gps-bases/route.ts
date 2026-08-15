import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_REQUEST_COMPANIES,
  normalizeCompany,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { resolveActiveOrganizationMembershipForUserId } from "@/app/lib/saas/organization-membership.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  getAuthenticatedRequestUser,
} from "@/app/lib/account-requests.server";
import { hasUserPermission } from "@/app/lib/auth/permissions";

type GpsBaseType = "bureau" | "entrepot" | "chantier" | "client" | "autre";

async function requireGpsBasesAccess(req: NextRequest) {
  const authenticated = await getAuthenticatedRequestUser(req);
  const role = authenticated.role;
  const user = authenticated.user;
  if (!user || (role !== "direction" && role !== "admin")) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Acces refuse." }, { status: 403 }),
    };
  }
  const hasPermission =
    hasUserPermission(user, "ressources", role) ||
    hasUserPermission(user, "terrain", role);
  if (!hasPermission) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Permission ressources ou terrain requise." },
        { status: 403 }
      ),
    };
  }

  let organizationId = authenticated.organizationId;
  if (!organizationId) {
    const membership = await resolveActiveOrganizationMembershipForUserId(user.id);
    if (!membership.ok) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Membership organisation active requise." },
          { status: 403 }
        ),
      };
    }
    organizationId = membership.organizationId;
  }

  return {
    ok: true as const,
    user,
    organizationId,
  };
}

async function resolveCompanyId(
  organizationId: string,
  companyCode: AccountRequestCompany
) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("organization_companies")
    .select("id, company_code")
    .eq("organization_id", organizationId)
    .eq("company_code", companyCode)
    .eq("status", "active")
    .maybeSingle<{ id: string; company_code: string }>();
  if (error) throw error;
  return data ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await requireGpsBasesAccess(req);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("gps_bases")
    .select(
      "id, organization_id, organization_company_id, nom, adresse, latitude, longitude, rayon_m, company_context, type_base, created_at, updated_at"
    )
    .eq("organization_id", auth.organizationId)
    .order("nom", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bases: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireGpsBasesAccess(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as Record<string, unknown>;
  const companyCode = normalizeCompany(body.company_context);
  if (!companyCode) {
    return NextResponse.json({ error: "company_context invalide." }, { status: 400 });
  }

  const company = await resolveCompanyId(auth.organizationId, companyCode);
  if (!company) {
    return NextResponse.json(
      { error: "Compagnie introuvable dans cette organisation." },
      { status: 400 }
    );
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const adresse = typeof body.adresse === "string" ? body.adresse.trim() : "";
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const rayon = Number(body.rayon_m);
  const typeBase = String(body.type_base ?? "autre") as GpsBaseType;

  if (!nom || !adresse || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !(rayon > 0)) {
    return NextResponse.json({ error: "Champs GPS invalides." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("gps_bases")
    .insert({
      organization_id: auth.organizationId,
      organization_company_id: company.id,
      nom,
      adresse,
      latitude,
      longitude,
      rayon_m: Math.round(rayon),
      company_context: company.company_code,
      type_base: typeBase,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, organization_id, organization_company_id, nom, adresse, latitude, longitude, rayon_m, company_context, type_base, created_at, updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    base: data,
    companies: ACCOUNT_REQUEST_COMPANIES,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireGpsBasesAccess(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  const companyCode = normalizeCompany(body.company_context);
  if (!companyCode) {
    return NextResponse.json({ error: "company_context invalide." }, { status: 400 });
  }

  const company = await resolveCompanyId(auth.organizationId, companyCode);
  if (!company) {
    return NextResponse.json(
      { error: "Compagnie introuvable dans cette organisation." },
      { status: 400 }
    );
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const adresse = typeof body.adresse === "string" ? body.adresse.trim() : "";
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const rayon = Number(body.rayon_m);
  const typeBase = String(body.type_base ?? "autre") as GpsBaseType;

  if (!nom || !adresse || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !(rayon > 0)) {
    return NextResponse.json({ error: "Champs GPS invalides." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("gps_bases")
    .update({
      organization_id: auth.organizationId,
      organization_company_id: company.id,
      nom,
      adresse,
      latitude,
      longitude,
      rayon_m: Math.round(rayon),
      company_context: company.company_code,
      type_base: typeBase,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .select(
      "id, organization_id, organization_company_id, nom, adresse, latitude, longitude, rayon_m, company_context, type_base, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Base introuvable." }, { status: 404 });
  }

  return NextResponse.json({ base: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGpsBasesAccess(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id requis." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error, count } = await admin
    .from("gps_bases")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("organization_id", auth.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "Base introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
