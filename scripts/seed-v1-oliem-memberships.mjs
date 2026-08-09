#!/usr/bin/env node
/**
 * V1 Oliem membership seed — controlled per-environment script.
 *
 * DEFAULT: dry-run / NO WRITE (reads env DB for discovery only).
 * WRITE: requires explicit --write AND --owner-user-id <uuid>
 *
 * Conventions reused from repo scripts:
 * - createClient(@supabase/supabase-js) + SUPABASE_SERVICE_ROLE_KEY
 * - .env.local loader (insert-test-gps.mjs pattern)
 * - auth.admin.listUsers paging (bootstrap-founder-admin.mjs)
 * - AppRole from app_metadata/user_metadata.role (roles.ts)
 * - chauffeurs.auth_user_id linkage
 *
 * Naming:
 * - tenantKey = oliem_solution (business)
 * - organizationSlug = oliem-solution (DB lookup)
 * - organizationId = organizations.id UUID only
 *
 * Phase A: do NOT run --write. Prefer --help / node --check.
 * Remote dry-run is optional and not auto-launched by agents.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OLIEM_TENANT_KEY = "oliem_solution";
const OLIEM_TENANT_SLUG = "oliem-solution";

/** Existing AppRole → H4 membership role (owner never auto-assigned). */
const ROLE_MAP = {
  admin: "organization_admin",
  direction: "direction",
  employe: "employe",
};

const APP_ROLES = new Set(["admin", "direction", "employe"]);

function parseArgs(argv) {
  const args = {
    write: false,
    ownerUserId: null,
    help: false,
    allowRemote: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--write") {
      args.write = true;
    } else if (a === "--owner-user-id") {
      args.ownerUserId = argv[i + 1] ?? null;
      i += 1;
    } else if (a === "--allow-remote") {
      args.allowRemote = true;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    throw new Error(".env.local not found at repo root");
  }
  const raw = readFileSync(p, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function requireEnvFrom(env, name) {
  const value = env[name] ?? process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createAdminClient() {
  const fileEnv = existsSync(resolve(process.cwd(), ".env.local"))
    ? loadEnvLocal()
    : {};
  const url = requireEnvFrom(fileEnv, "NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvFrom(fileEnv, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function logInfo(message, detail) {
  if (detail === undefined) {
    console.log(`[seed-v1-oliem-memberships] ${message}`);
    return;
  }
  console.log(`[seed-v1-oliem-memberships] ${message}`, detail);
}

function printHelp() {
  console.log(`
seed-v1-oliem-memberships.mjs

Default: DRY RUN (reads env DB; no membership writes).

Options:
  --allow-remote          Allow connecting to current .env.local Supabase (read)
  --write                 Explicit write mode (requires --owner-user-id)
  --owner-user-id <uuid>  Auth user id granted organization_owner
  --help                  Show help

Tenant:
  tenantKey=${OLIEM_TENANT_KEY}
  slug=${OLIEM_TENANT_SLUG}

Role mapping (AppRole → H4; owner never automatic):
  admin     -> organization_admin
  direction -> direction
  employe   -> employe

Safety:
  - No secrets logged
  - No DELETE memberships
  - Import does not connect or write
`);
}

function normalizeAppRole(value) {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "employe" || role === "employee" || role === "chauffeur") {
    return "employe";
  }
  if (role === "admin") return "admin";
  if (role === "direction" || role === "manager") return "direction";
  return null;
}

function extractAppRole(user) {
  return (
    normalizeAppRole(user?.app_metadata?.role) ??
    normalizeAppRole(user?.user_metadata?.role)
  );
}

function mapAppRoleToMembershipRole(appRole) {
  if (!appRole || !ROLE_MAP[appRole]) return null;
  return ROLE_MAP[appRole];
}

function isAuthUserActive(user) {
  if (!user || !user.id) return false;
  if (user.banned_until) {
    const bannedUntil = new Date(user.banned_until).getTime();
    if (!Number.isNaN(bannedUntil) && bannedUntil > Date.now()) {
      return false;
    }
  }
  if (user.deleted_at) return false;
  return true;
}

/**
 * Resolve organizations.id for slug oliem-solution.
 * Exactly one active row required.
 */
async function resolveTenantOrganizationId(supabase) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, status, deleted_at")
    .eq("slug", OLIEM_TENANT_SLUG)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`tenant lookup failed: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    throw new Error(
      `tenant not found for slug=${OLIEM_TENANT_SLUG} (apply H4B + V1 seed first)`
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `ambiguous tenant: ${rows.length} organizations with slug=${OLIEM_TENANT_SLUG}`
    );
  }

  const org = rows[0];
  if (org.status !== "active") {
    throw new Error(
      `tenant slug=${OLIEM_TENANT_SLUG} is not active (status=${org.status})`
    );
  }
  if (!isUuid(org.id)) {
    throw new Error("tenant organization id is not a UUID");
  }
  return org.id;
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

async function loadLinkedChauffeurAuthIds(supabase) {
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id, auth_user_id, actif")
    .not("auth_user_id", "is", null);

  if (error) {
    throw new Error(`chauffeurs lookup failed: ${error.message}`);
  }

  /** @type {Map<string, { chauffeurIds: number[], activeLinks: number }>} */
  const byAuth = new Map();
  for (const row of data ?? []) {
    const authId = row.auth_user_id;
    if (!authId || !isUuid(authId)) continue;
    const entry = byAuth.get(authId) ?? { chauffeurIds: [], activeLinks: 0 };
    entry.chauffeurIds.push(row.id);
    if (row.actif === true || row.actif === null || row.actif === undefined) {
      // treat null actif as linked (legacy); prefer actif===true when set
      if (row.actif === true || row.actif == null) {
        entry.activeLinks += 1;
      }
    }
    byAuth.set(authId, entry);
  }
  return byAuth;
}

/**
 * Discover unambiguous TAGORA Time users in the current environment.
 * Sources: auth users with AppRole and/or chauffeurs.auth_user_id link.
 */
async function discoverCandidateUsers(supabase) {
  const [authUsers, chauffeurByAuth] = await Promise.all([
    listAllAuthUsers(supabase),
    loadLinkedChauffeurAuthIds(supabase),
  ]);

  const candidates = [];
  const skipped = [];

  for (const user of authUsers) {
    if (!isAuthUserActive(user)) {
      skipped.push({ userId: user.id, reason: "inactive_or_banned" });
      continue;
    }

    const link = chauffeurByAuth.get(user.id) ?? null;
    if (link && link.chauffeurIds.length > 1) {
      skipped.push({
        userId: user.id,
        reason: "ambiguous_multiple_chauffeurs",
        chauffeurCount: link.chauffeurIds.length,
      });
      continue;
    }

    const appRole = extractAppRole(user);
    const hasActiveChauffeurLink =
      !!link && link.chauffeurIds.length === 1 && link.activeLinks >= 1;

    if (!appRole && !hasActiveChauffeurLink) {
      skipped.push({ userId: user.id, reason: "not_linked_to_tagora_time" });
      continue;
    }

    const effectiveAppRole = appRole ?? "employe";
    if (!APP_ROLES.has(effectiveAppRole)) {
      skipped.push({ userId: user.id, reason: "unsupported_app_role" });
      continue;
    }

    const membershipRole = mapAppRoleToMembershipRole(effectiveAppRole);
    if (!membershipRole) {
      skipped.push({ userId: user.id, reason: "role_mapping_failed" });
      continue;
    }

    candidates.push({
      userId: user.id,
      appRole: effectiveAppRole,
      membershipRole,
      source: appRole
        ? hasActiveChauffeurLink
          ? "app_role+chauffeur"
          : "app_role"
        : "chauffeur_link",
      hasChauffeurLink: hasActiveChauffeurLink,
    });
  }

  return { candidates, skipped };
}

async function loadExistingMemberships(supabase, organizationId) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status, is_default")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`memberships lookup failed: ${error.message}`);
  }

  const byUser = new Map();
  for (const row of data ?? []) {
    byUser.set(row.user_id, row);
  }
  return byUser;
}

function buildMembershipPlan({
  organizationId,
  candidates,
  existingByUser,
  ownerUserId,
}) {
  const plan = [];

  for (const c of candidates) {
    const existing = existingByUser.get(c.userId) ?? null;
    let role = c.membershipRole;
    if (ownerUserId && c.userId === ownerUserId) {
      role = "organization_owner";
    }

    if (existing) {
      plan.push({
        action: "preserve_existing",
        userId: c.userId,
        organizationId,
        role: existing.role,
        status: existing.status,
        plannedRole: role,
        note:
          existing.status === "active"
            ? "existing active membership preserved"
            : "existing non-active membership preserved (no auto-degrade)",
      });
      continue;
    }

    plan.push({
      action: "insert",
      userId: c.userId,
      organizationId,
      role,
      status: "active",
      is_default: true,
      note: "missing membership — would insert on --write",
    });
  }

  if (ownerUserId) {
    const ownerInPlan = plan.find((p) => p.userId === ownerUserId);
    if (!ownerInPlan) {
      const existing = existingByUser.get(ownerUserId) ?? null;
      if (existing) {
        plan.push({
          action: "preserve_existing",
          userId: ownerUserId,
          organizationId,
          role: existing.role,
          status: existing.status,
          plannedRole: "organization_owner",
          note: "owner selected but already has membership — preserved in dry-run; write may promote if safe",
        });
      } else {
        plan.push({
          action: "insert",
          userId: ownerUserId,
          organizationId,
          role: "organization_owner",
          status: "active",
          is_default: true,
          note: "owner not in candidates — would insert organization_owner on --write",
        });
      }
    }
  }

  return plan;
}

function assertOwnerPresent(plan, ownerUserId, mode) {
  if (!ownerUserId) {
    if (mode === "write") {
      throw new Error("--write requires --owner-user-id");
    }
    logInfo("ownerUserId missing — required for --write; dry-run continues");
    return;
  }
  if (!isUuid(ownerUserId)) {
    throw new Error("--owner-user-id must be a UUID");
  }
  const ownerRows = plan.filter((p) => p.userId === ownerUserId);
  if (ownerRows.length === 0) {
    throw new Error("owner user id not found among auth users / plan");
  }
}

async function dryRun(supabase, args) {
  logInfo("mode=DRY_RUN (default; no membership writes)");
  logInfo(`tenantKey=${OLIEM_TENANT_KEY}`);
  logInfo(`organizationSlug=${OLIEM_TENANT_SLUG}`);
  logInfo("roleMap", ROLE_MAP);

  const organizationId = await resolveTenantOrganizationId(supabase);
  logInfo("tenantResolved", {
    organizationSlug: OLIEM_TENANT_SLUG,
    organizationIdPrefix: `${organizationId.slice(0, 8)}…`,
  });

  const { candidates, skipped } = await discoverCandidateUsers(supabase);
  logInfo(`candidates=${candidates.length}`);
  logInfo(`skipped=${skipped.length}`);
  for (const s of skipped.slice(0, 50)) {
    logInfo("skippedUser", {
      userIdPrefix: `${String(s.userId).slice(0, 8)}…`,
      reason: s.reason,
    });
  }

  const existingByUser = await loadExistingMemberships(supabase, organizationId);
  logInfo(`existingMemberships=${existingByUser.size}`);

  const plan = buildMembershipPlan({
    organizationId,
    candidates,
    existingByUser,
    ownerUserId: args.ownerUserId,
  });

  assertOwnerPresent(plan, args.ownerUserId, "dry-run");

  const inserts = plan.filter((p) => p.action === "insert").length;
  const preserved = plan.filter((p) => p.action === "preserve_existing").length;
  logInfo("membershipPlanSummary", { inserts, preserved, total: plan.length });

  for (const row of plan) {
    logInfo("planRow", {
      action: row.action,
      userIdPrefix: `${row.userId.slice(0, 8)}…`,
      role: row.role,
      status: row.status,
      note: row.note,
    });
  }

  const ownerMissingForWrite = !args.ownerUserId;
  if (ownerMissingForWrite) {
    logInfo("ownerAbsentForWrite=yes (pass --owner-user-id with --write)");
  }

  logInfo("DRY_RUN_DB_WRITE_COUNT=0");
  logInfo("No membership INSERT/UPDATE/DELETE executed.");
}

async function writeMode(supabase, args) {
  if (!args.write) {
    throw new Error("writeMode called without --write");
  }
  if (!args.ownerUserId || !isUuid(args.ownerUserId)) {
    throw new Error("--write requires valid --owner-user-id <uuid>");
  }

  const organizationId = await resolveTenantOrganizationId(supabase);
  const { candidates, skipped } = await discoverCandidateUsers(supabase);
  const existingByUser = await loadExistingMemberships(supabase, organizationId);
  const plan = buildMembershipPlan({
    organizationId,
    candidates,
    existingByUser,
    ownerUserId: args.ownerUserId,
  });
  assertOwnerPresent(plan, args.ownerUserId, "write");

  // Validate owner exists in auth
  const { data: ownerData, error: ownerErr } =
    await supabase.auth.admin.getUserById(args.ownerUserId);
  if (ownerErr || !ownerData?.user) {
    throw new Error("owner user unknown in auth");
  }
  if (!isAuthUserActive(ownerData.user)) {
    throw new Error("owner user is inactive/banned");
  }

  let inserted = 0;
  let skippedExisting = 0;

  for (const row of plan) {
    if (row.action === "preserve_existing") {
      skippedExisting += 1;
      continue;
    }
    if (row.action !== "insert") continue;

    // Idempotent: re-check before insert (unique org+user)
    const { data: existing, error: selErr } = await supabase
      .from("organization_memberships")
      .select("id, role, status")
      .eq("organization_id", organizationId)
      .eq("user_id", row.userId)
      .maybeSingle();
    if (selErr) {
      throw new Error(`membership precheck failed: ${selErr.message}`);
    }
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("organization_memberships").insert({
      organization_id: organizationId,
      user_id: row.userId,
      role: row.role,
      status: "active",
      is_default: true,
    });
    if (insErr) {
      // Unique race / conflict → treat as preserved
      if (String(insErr.message || "").toLowerCase().includes("duplicate")) {
        skippedExisting += 1;
        continue;
      }
      throw new Error(`membership insert failed: ${insErr.message}`);
    }
    inserted += 1;
  }

  // Owner promotion: if owner membership exists with non-owner role, update role only
  const { data: ownerMembership, error: omErr } = await supabase
    .from("organization_memberships")
    .select("id, role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", args.ownerUserId)
    .maybeSingle();
  if (omErr) {
    throw new Error(`owner membership lookup failed: ${omErr.message}`);
  }
  if (!ownerMembership) {
    const { error: ownerInsErr } = await supabase
      .from("organization_memberships")
      .insert({
        organization_id: organizationId,
        user_id: args.ownerUserId,
        role: "organization_owner",
        status: "active",
        is_default: true,
      });
    if (ownerInsErr) {
      throw new Error(`owner insert failed: ${ownerInsErr.message}`);
    }
    inserted += 1;
  } else if (
    ownerMembership.role !== "organization_owner" &&
    ownerMembership.status === "active"
  ) {
    const { error: upErr } = await supabase
      .from("organization_memberships")
      .update({ role: "organization_owner" })
      .eq("id", ownerMembership.id);
    if (upErr) {
      throw new Error(`owner promote failed: ${upErr.message}`);
    }
  }

  logInfo("writeComplete", {
    inserted,
    skippedExisting,
    skippedDiscovery: skipped.length,
    // Never log secrets / full UUIDs lists
  });
  logInfo("MEMBERSHIP_DELETE_SUPPORTED=no (no deletes executed)");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  // Guard remote connection: require --allow-remote or --write for env DB access.
  // Agents should not auto-pass --allow-remote.
  if (!args.allowRemote && !args.write) {
    logInfo("mode=DRY_RUN_LOCAL_GUARD");
    logInfo(
      "No remote connection. Pass --allow-remote to run read-only discovery against .env.local."
    );
    logInfo(`tenantKey=${OLIEM_TENANT_KEY}`);
    logInfo(`organizationSlug=${OLIEM_TENANT_SLUG}`);
    logInfo("roleMap", ROLE_MAP);
    logInfo("DRY_RUN_REMOTE_READY=yes");
    logInfo("DRY_RUN_DB_WRITE_COUNT=0");
    return;
  }

  const supabase = createAdminClient();

  if (args.write) {
    await writeMode(supabase, args);
    return;
  }

  await dryRun(supabase, args);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("seed-v1-oliem-memberships.mjs") ||
    process.argv[1].endsWith("seed-v1-oliem-memberships.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error(
      `[seed-v1-oliem-memberships] ERROR: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exitCode = 1;
  });
}

export {
  OLIEM_TENANT_KEY,
  OLIEM_TENANT_SLUG,
  ROLE_MAP,
  parseArgs,
  isUuid,
  normalizeAppRole,
  mapAppRoleToMembershipRole,
  buildMembershipPlan,
};
