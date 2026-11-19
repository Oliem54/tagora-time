/**
 * Staging certification plan for the membership role writer that is already
 * installed. This module does not open a connection and does not assign a role.
 */

export const HORORA_STAGING_PROJECT_ID = "qokyobcvplzufshydhih";

export const HORORA_STAGING_ROLE_RPC = "commit_horora_membership_role_with_audit";

export const HORORA_STAGING_ROLE_RPC_ARGS = [
  "p_actor_user_id",
  "p_organization_id",
  "p_target_user_id",
  "p_new_role",
  "p_is_default",
  "p_target_employee_id",
  "p_changed_by_email",
  "p_reason",
] as const;

export const HORORA_STAGING_ROLE_CERTIFICATION_PLAN = {
  projectId: HORORA_STAGING_PROJECT_ID,
  url: "https://time.staging.tagora.ca",
  rpc: HORORA_STAGING_ROLE_RPC,
  allowedNextRoles: ["employe", "direction"],
  auditTable: "user_role_audit_logs",
  execute: false,
  requiresDistinctGo: true,
} as const;

/**
 * Read-only Staging facts from 2026-11-17. This object does not connect
 * and does not assign a role.
 */
export const HORORA_ROLE_WRITER_STAGING_PREFLIGHT = {
  projectId: HORORA_STAGING_PROJECT_ID,
  readOnly: true,
  roleWrites: 0,
  migrationAppliedByThisChange: false,
  rpcVisibleToServiceRole: true,
  rpcArguments: HORORA_STAGING_ROLE_RPC_ARGS,
  anonRpcVisible: false,
  membershipColumnsPresent: true,
  auditTablePresent: true,
  sessionRevocationColumnPresent: true,
  actorAttested: false,
  targetAttested: false,
} as const;

/**
 * Local preview candidate only. It is not deployed and it is not pushed.
 * Replay these commits onto the certified production base, and leave the
 * employee clock commit out. The role-transition commit that records this
 * list is replayed after the writer commit.
 */
export const HORORA_ISOLATED_PREVIEW_CANDIDATE = {
  deployed: false,
  published: false,
  productionBase: "0c22a8a518bf5d41ed512da632caf0481e6998f4",
  requiredCommits: [
    "8a33fd78794699dc3f53c045712b484341a3258d",
    "f6ea95ed73962fde0f8a51b4fbcdf323d798d047",
    "a73964c30e9d1ac3769a8c3c231354447abab3d7",
    "c49cd01aca9257dd737884110b3a1bf1965b2f45",
    "de5ed5768298403a37b48b2bb3272a8fe5750618",
    "8473d71f700811251f5d7fe7f7edc984b45d064b",
    "3f0e414cd00bab63362cf46580d75fe91f08a416",
    "045dda3c14b3d922b8cd9921904df4eb155bf52d",
  ],
  includesHttpGuards: "3f0e414cd00bab63362cf46580d75fe91f08a416",
  includesRoleWriter: "045dda3c14b3d922b8cd9921904df4eb155bf52d",
  excludedCommit: "e92431c67e8977ec684612f86e9f89e7bc25c770",
  replayRoleTransitionCommit: true,
} as const;

export const HORORA_ROLE_WRITER_ISOLATED_DELIVERY = {
  productionBase: "0c22a8a518bf5d41ed512da632caf0481e6998f4",
  dependsOnLocalTip: "3f0e414cd00bab63362cf46580d75fe91f08a416",
  localCommitsAheadOfProductionBeforeThisChange: 8,
  publishBranch: false,
  path: "Do not push fix/horora-geo-retry-position-unavailable. Deliver only the role-writer commit, and only under a distinct GO.",
} as const;

export const HORORA_PREMIUM_REMAINING = {
  permissionEdits: "local_writer_prepared",
  localSuspension: "local_writer_prepared",
  teams: "company_scope_enforced",
  jwtClaimsUntilRefresh: "membership_reread_does_not_refresh_existing_jwt",
  remoteApply: "requires_distinct_go",
} as const;

export function assertStagingRoleCertificationStaysUnexecuted(): void {
  if (HORORA_STAGING_ROLE_CERTIFICATION_PLAN.execute !== false) {
    throw new Error("staging_role_certification_must_stay_unexecuted");
  }
}
