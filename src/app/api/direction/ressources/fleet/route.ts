import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
}

function parseKind(value: unknown): "vehicule" | "remorque" | null {
  if (value === "remorque") return "remorque";
  if (value === "vehicule") return "vehicule";
  return null;
}

export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user || (role !== "direction" && role !== "admin")) {
    return forbidden();
  }

  const supabase = createAdminSupabaseClient();
  const [vRes, rRes] = await Promise.all([
    supabase.from("vehicules").select("*").order("id", { ascending: true }),
    supabase.from("remorques").select("*").order("id", { ascending: true }),
  ]);

  if (vRes.error) {
    return NextResponse.json({ error: vRes.error.message }, { status: 400 });
  }
  if (rRes.error) {
    return NextResponse.json({ error: rRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    vehicules: vRes.data ?? [],
    remorques: rRes.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user || (role !== "direction" && role !== "admin")) {
    return forbidden();
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.resource_kind);
  const nom = String(body?.nom ?? "").trim();
  const plaque = String(body?.plaque ?? "").trim();
  const descriptionRaw = body?.description;
  const description =
    descriptionRaw === null || descriptionRaw === undefined
      ? null
      : String(descriptionRaw).trim() || null;
  const actif = body?.actif !== undefined ? Boolean(body.actif) : true;

  if (!kind) {
    return NextResponse.json(
      { error: "resource_kind requis : « vehicule » ou « remorque »." },
      { status: 400 }
    );
  }
  if (!nom) {
    return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
  }
  if (!plaque) {
    return NextResponse.json({ error: "La plaque est obligatoire." }, { status: 400 });
  }

  const table = kind === "remorque" ? "remorques" : "vehicules";
  const supabase = createAdminSupabaseClient();
  const res = await supabase
    .from(table)
    .insert({ nom, plaque, description, actif })
    .select("*")
    .single();

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }

  return NextResponse.json({ item: res.data, resource_kind: kind }, { status: 201 });
}
