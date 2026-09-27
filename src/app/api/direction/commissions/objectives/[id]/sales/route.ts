import { NextRequest, NextResponse } from "next/server";
import {
  getUserDisplayName,
  requireAdminFinanceCommissionsAccess,
} from "@/app/api/direction/commissions/_lib";
import { todayIsoLocal } from "@/app/lib/commissions/commissions.shared";
import {
  insertSaleLines,
  listSaleLines,
  loadSaleLedgerContext,
} from "@/app/lib/commissions/sales-ledger.server";
import { businessCalendarDate, type SaleLineKind } from "@/app/lib/commissions/sales-ledger.shared";
import { assessClientScope } from "@/app/lib/tenant-scope.shared";

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown) {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function asKind(value: unknown): SaleLineKind | null {
  if (value === "sale" || value === "adjustment" || value === "correction") return value;
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const clientOrganizationId = req.nextUrl.searchParams.get("organization_id");
    const clientCompanyId = req.nextUrl.searchParams.get("company_id");
    const context = await loadSaleLedgerContext(auth.supabase, auth.user, id, auth.organizationId);
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }
    const scopeCheck = assessClientScope({
      sessionOrganizationId: auth.organizationId,
      allowedCompanyIds: [context.organizationCompanyId],
      clientOrganizationId,
      clientCompanyId,
    });
    if (!scopeCheck.ok) {
      return NextResponse.json({ error: "Portee client refusee." }, { status: 403 });
    }
    const listed = await listSaleLines(auth.supabase, id, {
      organizationId: context.organizationId,
      organizationCompanyId: context.organizationCompanyId,
    });
    if (!listed.ok) {
      return NextResponse.json({ error: listed.error }, { status: listed.status });
    }
    return NextResponse.json({
      ledgerAvailable: listed.ledgerAvailable,
      lines: listed.lines,
      defaultSaleDate: businessCalendarDate(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur registre de ventes." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminFinanceCommissionsAccess(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const context = await loadSaleLedgerContext(
      auth.supabase,
      auth.user,
      id,
      auth.organizationId
    );
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }
    const scopeCheck = assessClientScope({
      sessionOrganizationId: auth.organizationId,
      allowedCompanyIds: [context.organizationCompanyId],
      clientOrganizationId: body.organization_id ?? body.organizationId,
      clientCompanyId: body.company_id ?? body.companyId ?? body.organization_company_id,
    });
    if (!scopeCheck.ok) {
      return NextResponse.json({ error: "Portee client refusee." }, { status: 403 });
    }
    const kind = asKind(body.kind) ?? "sale";
    const amount = asNumber(body.amount);
    const salesCount = Math.trunc(asNumber(body.sales_count));
    if (!Number.isFinite(amount) || !Number.isFinite(salesCount)) {
      return NextResponse.json({ error: "Montant ou nombre invalide." }, { status: 400 });
    }

    const result = await insertSaleLines({
      supabase: auth.supabase,
      user: auth.user,
      objectiveId: id,
      organizationId: auth.organizationId,
      actorName: getUserDisplayName(auth.user),
      todayIso: todayIsoLocal(),
      drafts: [
        {
          kind,
          saleDate: asText(body.sale_date) ?? businessCalendarDate(),
          reference: asText(body.reference),
          label: asText(body.label) ?? (kind === "sale" ? "Vente" : "Ajustement"),
          amount,
          salesCount,
          notes: asText(body.notes),
          correctsLineId: asText(body.corrects_line_id),
          source: "manual",
        },
      ],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: "code" in result ? result.code : undefined },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur enregistrement vente." },
      { status: 500 }
    );
  }
}
