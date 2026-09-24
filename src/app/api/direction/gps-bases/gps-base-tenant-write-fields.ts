export function buildGpsBaseTenantWriteFields(input: {
  actorOrganizationId: string;
  company: { id: string; company_code: string };
  clientBody?: Record<string, unknown>;
}) {
  void input.clientBody?.compagnie;
  void input.clientBody?.company_context;
  void input.clientBody?.organization_id;
  void input.clientBody?.organization_company_id;

  const companyCode = input.company.company_code;
  return {
    organization_id: input.actorOrganizationId,
    organization_company_id: input.company.id,
    company_context: companyCode,
    compagnie: companyCode,
  };
}
