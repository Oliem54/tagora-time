import type { User } from "@supabase/supabase-js";
import {
  actorMayUseCompany,
  projectAchievedFromLines,
  readActorCompanyCodes,
  resolveSaleCompany,
  validateSaleLineDraft,
  type SaleLineDraft,
} from "@/app/lib/commissions/sales-ledger.shared";
import { recalculateObjectiveCommissions } from "@/app/lib/commissions/recalculate.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export function isMissingSaleLedgerError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("commission_sale_lines") && message.includes("does not exist")
  );
}

export async function loadSaleLedgerContext(
  supabase: AdminClient,
  user: User,
  objectiveId: string,
  organizationId: string
) {
  if (!organizationId) {
    return { ok: false as const, error: "Organisation de session absente.", status: 403 as const };
  }

  const objectiveRes = await supabase
    .from("sales_objectives")
    .select("id, target_type, company_context, chauffeur_id, status, organization_id")
    .eq("id", objectiveId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (objectiveRes.error || !objectiveRes.data) {
    return { ok: false as const, error: "Objectif introuvable.", status: 404 as const };
  }

  const objective = objectiveRes.data as Record<string, unknown>;
  const chauffeurId = Number(objective.chauffeur_id);
  let chauffeurCompany: string | null = null;
  let chauffeurOrganizationId: string | null = null;
  let organizationCompanyId: string | null = null;
  if (Number.isFinite(chauffeurId) && chauffeurId > 0) {
    const chauffeurRes = await supabase
      .from("chauffeurs")
      .select("id, primary_company, organization_id, organization_company_id")
      .eq("id", chauffeurId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (chauffeurRes.error) {
      return { ok: false as const, error: chauffeurRes.error.message, status: 400 as const };
    }
    chauffeurCompany =
      typeof chauffeurRes.data?.primary_company === "string"
        ? chauffeurRes.data.primary_company
        : null;
    chauffeurOrganizationId =
      typeof chauffeurRes.data?.organization_id === "string"
        ? chauffeurRes.data.organization_id
        : null;
    organizationCompanyId =
      typeof chauffeurRes.data?.organization_company_id === "string"
        ? chauffeurRes.data.organization_company_id
        : null;
  }

  const company = resolveSaleCompany({
    objectiveCompany: typeof objective.company_context === "string" ? objective.company_context : null,
    chauffeurCompany,
  });
  if (!company.ok) return { ok: false as const, error: company.error, status: 409 as const };

  const actorCompanies = readActorCompanyCodes({
    app_metadata: user.app_metadata as Record<string, unknown> | undefined,
    user_metadata: user.user_metadata as Record<string, unknown> | undefined,
  });
  if (!actorMayUseCompany(actorCompanies, company.company)) {
    return { ok: false as const, error: "Acces refuse pour cette compagnie.", status: 403 as const };
  }

  const objectiveOrganizationId =
    typeof objective.organization_id === "string" ? objective.organization_id : null;
  if (!objectiveOrganizationId || objectiveOrganizationId !== organizationId) {
    return { ok: false as const, error: "Objectif hors du tenant de la session.", status: 404 as const };
  }

  if (
    Number.isFinite(chauffeurId) &&
    chauffeurId > 0 &&
    (chauffeurOrganizationId !== organizationId || !organizationCompanyId)
  ) {
    return {
      ok: false as const,
      error: "La compagnie de l'employe n'appartient pas au tenant de la session.",
      status: 403 as const,
    };
  }

  if (!organizationCompanyId) {
    const companyCode = company.company;
    if (!companyCode) {
      return { ok: false as const, error: "Compagnie de vente non resolue.", status: 409 as const };
    }
    const companyRes = await supabase
      .from("organization_companies")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("company_code", companyCode)
      .maybeSingle();
    if (companyRes.error || !companyRes.data?.id) {
      return {
        ok: false as const,
        error: "Compagnie introuvable dans le tenant de la session.",
        status: 403 as const,
      };
    }
    return {
      ok: true as const,
      targetType: objective.target_type === "sales_count" ? ("sales_count" as const) : ("amount" as const),
      company: company.company,
      organizationId,
      organizationCompanyId: String(companyRes.data.id),
      chauffeurId: Number.isFinite(chauffeurId) ? chauffeurId : null,
      objectiveStatus: typeof objective.status === "string" ? objective.status : "active",
    };
  }

  return {
    ok: true as const,
    targetType: objective.target_type === "sales_count" ? ("sales_count" as const) : ("amount" as const),
    company: company.company,
    organizationId,
    organizationCompanyId,
    chauffeurId: Number.isFinite(chauffeurId) ? chauffeurId : null,
    objectiveStatus: typeof objective.status === "string" ? objective.status : "active",
  };
}

export async function listSaleLines(
  supabase: AdminClient,
  objectiveId: string,
  scope: { organizationId: string; organizationCompanyId: string }
) {
  const result = await supabase
    .from("commission_sale_lines")
    .select(
      "id, objective_id, organization_id, organization_company_id, company_context, kind, sale_date, reference_code, label, amount, sales_count, notes, source, corrects_line_id, created_at"
    )
    .eq("objective_id", objectiveId)
    .eq("organization_id", scope.organizationId)
    .eq("organization_company_id", scope.organizationCompanyId)
    .order("sale_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error) {
    if (isMissingSaleLedgerError(result.error)) {
      return { ok: true as const, ledgerAvailable: false as const, lines: [] };
    }
    return { ok: false as const, error: result.error.message, status: 400 as const };
  }

  return {
    ok: true as const,
    ledgerAvailable: true as const,
    lines: (result.data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: String(record.id),
        kind: String(record.kind),
        saleDate: String(record.sale_date),
        reference: typeof record.reference_code === "string" ? record.reference_code : null,
        label: String(record.label ?? ""),
        amount: Number(record.amount ?? 0),
        salesCount: Math.trunc(Number(record.sales_count ?? 0)),
        notes: typeof record.notes === "string" ? record.notes : null,
        source: String(record.source ?? "manual"),
        correctsLineId:
          typeof record.corrects_line_id === "string" ? record.corrects_line_id : null,
        company: typeof record.company_context === "string" ? record.company_context : null,
        createdAt: String(record.created_at ?? ""),
      };
    }),
  };
}

export async function objectiveHasSaleLines(
  supabase: AdminClient,
  objectiveId: string,
  scope: { organizationId: string; organizationCompanyId: string }
) {
  const listed = await listSaleLines(supabase, objectiveId, scope);
  if (!listed.ok) return listed;
  return {
    ok: true as const,
    hasLines: listed.ledgerAvailable && listed.lines.length > 0,
    ledgerAvailable: listed.ledgerAvailable,
  };
}

export async function insertSaleLines(input: {
  supabase: AdminClient;
  user: User;
  objectiveId: string;
  organizationId: string;
  drafts: SaleLineDraft[];
  actorName: string;
  todayIso: string;
}) {
  const context = await loadSaleLedgerContext(
    input.supabase,
    input.user,
    input.objectiveId,
    input.organizationId
  );
  if (!context.ok) return context;
  if (context.objectiveStatus === "cancelled") {
    return {
      ok: false as const,
      error: "Un objectif annule n'accepte plus de ventes.",
      status: 409 as const,
    };
  }

  const existing = await listSaleLines(input.supabase, input.objectiveId, {
    organizationId: context.organizationId,
    organizationCompanyId: context.organizationCompanyId,
  });
  if (!existing.ok) return existing;
  if (!existing.ledgerAvailable) {
    return {
      ok: false as const,
      error: "Le registre de ventes n'est pas encore disponible.",
      code: "SALE_LEDGER_UNAVAILABLE",
      status: 503 as const,
    };
  }

  const knownReferences = new Set(
    existing.lines
      .map((line) => line.reference?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );
  const running = existing.lines.map((line) => ({
    amount: line.amount,
    salesCount: line.salesCount,
  }));

  for (const draft of input.drafts) {
    const reference = draft.reference?.trim().toLowerCase() || null;
    if (draft.kind === "sale" && reference && knownReferences.has(reference)) {
      return {
        ok: false as const,
        error: `La reference ${draft.reference} existe deja pour cet objectif.`,
        status: 409 as const,
      };
    }
    if (draft.kind === "correction") {
      const target = existing.lines.find((line) => line.id === draft.correctsLineId);
      if (!target) {
        return { ok: false as const, error: "La ligne a corriger est introuvable.", status: 404 as const };
      }
    }
    const valid = validateSaleLineDraft({
      draft,
      targetType: context.targetType,
      existing: running,
    });
    if (!valid.ok) return { ok: false as const, error: valid.error, status: 400 as const };
    running.push({ amount: draft.amount, salesCount: draft.salesCount });
    if (reference) knownReferences.add(reference);
  }

  const projected = projectAchievedFromLines(running);
  if (!projected.ok) return { ok: false as const, error: projected.error, status: 400 as const };

  const insertRes = await input.supabase.from("commission_sale_lines").insert(
    input.drafts.map((draft) => ({
      objective_id: input.objectiveId,
      organization_id: context.organizationId,
      organization_company_id: context.organizationCompanyId,
      company_context: context.company,
      kind: draft.kind,
      sale_date: draft.saleDate,
      reference_code: draft.reference,
      label: draft.label.trim(),
      amount: draft.amount,
      sales_count: draft.salesCount,
      notes: draft.notes,
      source: draft.source,
      corrects_line_id: draft.correctsLineId,
      created_by: input.user.id,
      created_by_name: input.actorName,
    }))
  );

  if (insertRes.error) {
    if (isMissingSaleLedgerError(insertRes.error)) {
      return {
        ok: false as const,
        error: "Le registre de ventes n'est pas encore disponible.",
        code: "SALE_LEDGER_UNAVAILABLE",
        status: 503 as const,
      };
    }
    return { ok: false as const, error: insertRes.error.message, status: 400 as const };
  }

  const updateRes = await input.supabase
    .from("sales_objectives")
    .update({
      achieved_amount: projected.achievedAmount,
      achieved_sales_count: projected.achievedSalesCount,
      updated_by: input.user.id,
      updated_by_name: input.actorName,
    })
    .eq("id", input.objectiveId)
    .eq("organization_id", context.organizationId);

  if (updateRes.error) {
    return { ok: false as const, error: updateRes.error.message, status: 400 as const };
  }

  const recalculated = await recalculateObjectiveCommissions(
    input.supabase,
    input.objectiveId,
    input.todayIso
  );
  if ("error" in recalculated) {
    return { ok: false as const, error: recalculated.error, status: recalculated.status };
  }

  const lines = await listSaleLines(input.supabase, input.objectiveId, {
    organizationId: context.organizationId,
    organizationCompanyId: context.organizationCompanyId,
  });
  if (!lines.ok) return lines;

  return {
    ok: true as const,
    lines: lines.lines,
    achievedAmount: projected.achievedAmount,
    achievedSalesCount: projected.achievedSalesCount,
    objective: recalculated.objective,
  } as const;
}
