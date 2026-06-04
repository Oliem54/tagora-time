import { NextRequest, NextResponse } from "next/server";
import {
  getUserDisplayName,
  mapEntryRow,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const action =
      body.action === "validate" || body.action === "pay" || body.action === "cancel"
        ? body.action
        : null;

    if (!action) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const currentRes = await supabase
      .from("commission_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentRes.error || !currentRes.data) {
      return NextResponse.json({ error: "Commission introuvable." }, { status: 404 });
    }

    const current = mapEntryRow(currentRes.data as Record<string, unknown>);
    const patch: Record<string, unknown> = {};

    if (action === "validate") {
      if (current.status !== "estimated") {
        return NextResponse.json(
          { error: "Seules les commissions estimees peuvent etre validees." },
          { status: 409 }
        );
      }
      patch.status = "pending_validation";
      patch.validated_at = new Date().toISOString();
      patch.validated_by = user.id;
    }

    if (action === "pay") {
      if (current.status !== "pending_validation") {
        return NextResponse.json(
          { error: "Seules les commissions a valider peuvent etre payees." },
          { status: 409 }
        );
      }
      patch.status = "paid";
      patch.paid_at = new Date().toISOString();
      patch.paid_by = user.id;
    }

    if (action === "cancel") {
      if (current.status === "paid") {
        return NextResponse.json(
          { error: "Une commission payee ne peut pas etre annulee via ce flux." },
          { status: 409 }
        );
      }
      patch.status = "cancelled";
    }

    if (typeof body.notes === "string") {
      patch.notes = body.notes.trim() || null;
    }

    const updateRes = await supabase
      .from("commission_entries")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateRes.error || !updateRes.data) {
      return NextResponse.json(
        { error: updateRes.error?.message ?? "Mise a jour impossible." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      entry: mapEntryRow(updateRes.data as Record<string, unknown>),
      actor: getUserDisplayName(user),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur commission." },
      { status: 500 }
    );
  }
}
