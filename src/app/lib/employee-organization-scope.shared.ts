/**
 * Fail-closed organization scope for HORORA employee dossiers.
 * A missing actor organization, a missing employee organization, or a
 * different organization is outside the caller's scope.
 */

export function employeeBelongsToActorOrganization(input: {
  actorOrganizationId: string | null | undefined;
  employeeOrganizationId: unknown;
}): boolean {
  const actor = input.actorOrganizationId?.trim() ?? "";
  if (!actor) return false;
  return input.employeeOrganizationId === actor;
}

export function retainIdentityLinksForOrganizationAuthUsers<
  T extends { authUserId: unknown },
>(links: readonly T[], organizationAuthUserIds: ReadonlySet<string>): T[] {
  return links.filter(
    (link) =>
      typeof link.authUserId === "string" &&
      link.authUserId.length > 0 &&
      organizationAuthUserIds.has(link.authUserId)
  );
}

const CLIENT_ORGANIZATION_FIELDS = [
  "organization_id",
  "organizationId",
  "organization_company_id",
  "organizationCompanyId",
] as const;

export function stripClientOrganizationFields(
  body: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...body };
  for (const field of CLIENT_ORGANIZATION_FIELDS) {
    delete next[field];
  }
  return next;
}
