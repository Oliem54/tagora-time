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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user || (role !== "direction" && role !== "admin")) {
    return forbidden();
  }

  const { id: rawId } = await ctx.params;
  const id = Number(String(rawId ?? "").trim());
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const kind = parseKind(body.resource_kind);
  if (!kind) {
    return NextResponse.json(
      { error: "resource_kind requis : « vehicule » ou « remorque »." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};

  if (body.nom !== undefined) {
    const n = String(body.nom).trim();
    if (!n) {
      return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
    }
    patch.nom = n;
  }
  if (body.plaque !== undefined) {
    const p = String(body.plaque).trim();
    if (!p) {
      return NextResponse.json({ error: "La plaque ne peut pas être vide." }, { status: 400 });
    }
    patch.plaque = p;
  }
  if (body.description !== undefined) {
    const d = body.description;
    patch.description =
      d === null || d === "" ? null : String(d).trim() || null;
  }
  if (body.actif !== undefined) {
    patch.actif = Boolean(body.actif);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const table = kind === "remorque" ? "remorques" : "vehicules";
  const supabase = createAdminSupabaseClient();

  const existing = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 400 });
  }
  if (!existing.data) {
    return NextResponse.json({ error: "Élément introuvable." }, { status: 404 });
  }

  const res = await supabase.from(table).update(patch).eq("id", id).select("*").single();
  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }

  return NextResponse.json({ item: res.data, resource_kind: kind });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, role } = await getAuthenticatedRequestUser(req);
  if (!user || (role !== "direction" && role !== "admin")) {
    return forbidden();
  }

  const { id: rawId } = await ctx.params;
  const id = Number(String(rawId ?? "").trim());
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) {
    return NextResponse.json(
      { error: "Paramètre kind requis : vehicule ou remorque." },
      { status: 400 }
    );
  }

  const table = kind === "remorque" ? "remorques" : "vehicules";
  const supabase = createAdminSupabaseClient();
  const res = await supabase.from(table).delete().eq("id", id);

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, resource_kind: kind });
}
