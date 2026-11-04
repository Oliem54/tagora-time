export const HORORA_MEMBERSHIP_ROLE_AUDIT_RPC = "commit_horora_membership_role_with_audit";

export const APP_METADATA_ROLE_ANNOUNCEMENT_FAILED = "app_metadata_role_announcement_failed";

export const APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE =
  "Role enregistre et audite. Synchronisation secondaire en attente.";

export function recordedRoleSecondarySyncPending(role: AuditedMembershipRole) {
  return {
    success: false as const,
    code: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED,
    error: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE,
    message: APP_METADATA_ROLE_ANNOUNCEMENT_FAILED_MESSAGE,
    authoritativeRole: role,
    role,
    rolePersisted: true as const,
    audited: true as const,
    secondarySync: "pending" as const,
  };
}

export type AuditedMembershipRole = "employe" | "direction";

export type SimulatedMembershipStore = {
  role: string | null;
  audits: Array<{ oldRole: string | null; newRole: AuditedMembershipRole }>;
};

export type AuditedRoleCommitSuccess = {
  ok: true;
  role: AuditedMembershipRole;
  audited: boolean;
  unchanged: boolean;
};

export type AuditedRoleCommitFailure = {
  ok: false;
  code: string;
  status: number;
  error: string;
  audited: false;
  announced: false;
  membershipCommitted: false;
};

const RPC_FAILURES: Record<string, { status: number; error: string }> = {
  session_unreliable: { status: 403, error: "Session insuffisante pour changer le role." },
  unauthorized_membership_role: { status: 403, error: "Role de membership non autorise." },
  self_role_change_forbidden: { status: 403, error: "Vous ne pouvez pas modifier votre propre role." },
  actor_forbidden: { status: 403, error: "Cet acteur ne peut pas changer ce role." },
  direction_assignment_unauthorized: {
    status: 403,
    error: "L attribution ou le retrait du role Direction exige un administrateur de l organisation.",
  },
  cross_tenant_conflict: { status: 409, error: "Le compte appartient a une autre organisation." },
  protected_account_forbidden: { status: 403, error: "Ce compte protege ne peut pas etre modifie." },
  target_missing: { status: 404, error: "Compte portail introuvable." },
  membership_role_write_failed: { status: 500, error: "La membership n a pas ete ecrite." },
  audit_write_failed: { status: 500, error: "L audit du role n a pas ete ecrit." },
  audited_role_commit_unavailable: {
    status: 503,
    error: "La fonction atomique de role n est pas disponible. Aucun role n a ete change.",
  },
  audited_role_commit_failed: { status: 500, error: "Le changement de role audite a echoue." },
};

function failure(code: string): AuditedRoleCommitFailure {
  const known = RPC_FAILURES[code] ?? RPC_FAILURES.audited_role_commit_failed;
  return {
    ok: false,
    code: RPC_FAILURES[code] ? code : "audited_role_commit_failed",
    status: known.status,
    error: known.error,
    audited: false,
    announced: false,
    membershipCommitted: false,
  };
}

function codeFromRpcMessage(message: string): string {
  if (/schema cache|could not find the function/i.test(message)) {
    return "audited_role_commit_unavailable";
  }
  for (const code of Object.keys(RPC_FAILURES)) {
    if (message.includes(code)) return code;
  }
  return "audited_role_commit_failed";
}

/**
 * Result of the single SQL function. A Postgres error aborts that function,
 * so the membership role and the audit row are both absent. This does not
 * describe two Supabase calls: those do not roll back each other.
 */
export function interpretAuditedRoleCommitRpc(input: {
  errorMessage: string | null;
  data: {
    ok?: boolean;
    role?: string;
    audited?: boolean;
    action?: string;
  } | null;
  expectedRole: AuditedMembershipRole;
}): AuditedRoleCommitSuccess | AuditedRoleCommitFailure {
  if (input.errorMessage) {
    return failure(codeFromRpcMessage(input.errorMessage));
  }
  const data = input.data;
  if (!data || data.ok !== true || data.role !== input.expectedRole) {
    return failure("audited_role_commit_failed");
  }
  if (data.action === "noop") {
    return {
      ok: true,
      role: input.expectedRole,
      audited: false,
      unchanged: true,
    };
  }
  if (data.audited !== true) {
    return failure("audit_write_failed");
  }
  return {
    ok: true,
    role: input.expectedRole,
    audited: true,
    unchanged: false,
  };
}

/**
 * In-memory stand-in for the SQL function. An audit or membership failure
 * leaves the previous role and writes no audit. It does not write app_metadata.
 */
export function simulateAuditedMembershipRoleCommit(input: {
  refusedCode: string | null;
  action: "insert" | "repair" | "noop" | "assign";
  role: AuditedMembershipRole;
  previousMembershipRole: string | null;
  store: SimulatedMembershipStore;
  failAt: "none" | "membership" | "audit";
}): AuditedRoleCommitSuccess | AuditedRoleCommitFailure {
  if (input.refusedCode) {
    return failure(input.refusedCode);
  }
  if (input.action === "noop" || input.previousMembershipRole === input.role) {
    return {
      ok: true,
      role: input.role,
      audited: false,
      unchanged: true,
    };
  }
  if (input.failAt === "membership") {
    return failure("membership_role_write_failed");
  }
  const snapshot = {
    role: input.store.role,
    audits: input.store.audits.slice(),
  };
  input.store.role = input.role;
  if (input.failAt === "audit") {
    input.store.role = snapshot.role;
    input.store.audits = snapshot.audits;
    return failure("audit_write_failed");
  }
  input.store.audits.push({
    oldRole: input.previousMembershipRole,
    newRole: input.role,
  });
  return {
    ok: true,
    role: input.role,
    audited: true,
    unchanged: false,
  };
}
