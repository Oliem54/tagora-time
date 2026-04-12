import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  normalizeCompany,
  type AccountRequestCompany,
} from "@/app/lib/account-requests.shared";
import { requireAuthenticatedUser } from "@/app/lib/timeclock-api";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req, "livraisons");

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.response.error },
        { status: auth.response.status }
      );
    }

    const body = (await req.json()) as {
      livraison_id?: unknown;
      billing_company_context?: unknown;
    };

    const livraisonId = Number(body.livraison_id);
    const billingCompanyContext = normalizeCompany(body.billing_company_context);

    if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
      return NextResponse.json({ error: "Livraison invalide." }, { status: 400 });
    }

    if (!billingCompanyContext) {
      return NextResponse.json(
        { error: "Compagnie de refacturation invalide." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: livraison, error: loadError } = await supabase
      .from("livraisons_planifiees")
      .select("*")
      .eq("id", livraisonId)
      .maybeSingle<
        Record<string, unknown> & {
          id: number;
          company_context?: AccountRequestCompany | null;
          company?: AccountRequestCompany | null;
          compagnie?: AccountRequestCompany | null;
        }
      >();

    if (loadError) {
      throw loadError;
    }

    if (!livraison) {
      return NextResponse.json({ error: "Livraison introuvable." }, { status: 404 });
    }

    const deliveryCompany =
      livraison.company_context ?? livraison.company ?? livraison.compagnie ?? null;
    const intercompanyBillable = deliveryCompany
      ? billingCompanyContext !== deliveryCompany
      : true;

    const { data, error } = await supabase
      .from("livraisons_planifiees")
      .update({
        billing_company_context: billingCompanyContext,
        intercompany_billable: intercompanyBillable,
      })
      .eq("id", livraisonId)
      .select("id, billing_company_context, intercompany_billable")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, livraison: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur attribution compagnie livraison.",
      },
      { status: 500 }
    );
  }
}
