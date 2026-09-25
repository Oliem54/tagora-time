/**
 * HORORA operational time-data inventory / backup / scoped reset.
 *
 * Default: dry-run counts only (no PII).
 *
 *   node --env-file=.env.local scripts/horora-operational-reset.mjs inventory
 *   node --env-file=.env.local scripts/horora-operational-reset.mjs backup
 *   node --env-file=.env.local scripts/horora-operational-reset.mjs rollback-test
 *   node --env-file=.env.local scripts/horora-operational-reset.mjs execute
 *
 * execute requires:
 *   HORORA_RESET_CONFIRM=HORORA_OPERATIONAL_RESET
 *   HORORA_RESET_ORG_ID=<uuid>
 */
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const NEXUS_ORG = "org_tagora_internal";
const PHASE = process.argv[2] || "inventory";
const PRODUCTION_SUPABASE_HOST = "qcgvzdlfsxybrmloijpt.supabase.co";

function loadEnvFile(fileName, { overwrite = false } = {}) {
  const p = resolve(process.cwd(), fileName);
  if (!existsSync(p)) return false;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(/^\uFEFF/, "").trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === "[SENSITIVE]" || val === "") continue;
    if (overwrite || !process.env[key]) process.env[key] = val;
  }
  return true;
}

loadEnvFile(".env.local");
loadEnvFile(".env.production.local", { overwrite: true });

function supabaseHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function readVercelAuthToken() {
  const candidates = [
    join(process.env.APPDATA || "", "com.vercel.cli", "Data", "auth.json"),
    join(process.env.APPDATA || "", "xdg.data", "com.vercel.cli", "auth.json"),
    join(process.env.APPDATA || "", "com.vercel.cli", "auth.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8"));
      if (typeof parsed.token === "string" && parsed.token.trim()) {
        return parsed.token.trim();
      }
    } catch {
      // ignore unreadable auth files
    }
  }
  return null;
}

function isUsableSecretValue(value) {
  if (!value || value === "[SENSITIVE]") return false;
  if (value.startsWith("eyJ2Ijoi")) return false;
  return true;
}
  const token = readVercelAuthToken();
  if (!token) return { loaded: false, reason: "vercel_auth_missing" };
  const url = new URL("https://api.vercel.com/v10/projects/prj_VyucPe8kxHo8VMSfwiM75V4IX8du/env");
  url.searchParams.set("decrypt", "true");
  url.searchParams.set("teamId", "team_t74AXmVvxHMURdE1X8RJ2q4S");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return { loaded: false, reason: `vercel_env_http_${response.status}` };
  }
  const body = await response.json();
  const rows = Array.isArray(body.envs)
    ? body.envs
    : Array.isArray(body.env)
      ? body.env
      : Array.isArray(body)
        ? body
        : [];
  let applied = 0;
  let supabaseUrlChars = 0;
  let supabaseKeyChars = 0;
  const keyNames = [];
  const appliedNames = [];
  for (const row of rows) {
    const key = typeof row?.key === "string" ? row.key : "";
    const value = typeof row?.value === "string" ? row.value : "";
    const targets = Array.isArray(row?.target) ? row.target : [];
    if (!key) continue;
    keyNames.push(key);
    if (!isUsableSecretValue(value)) continue;
    if (targets.length && !targets.includes("production")) continue;
    process.env[key] = value;
    applied += 1;
    appliedNames.push(key);
    if (key === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrlChars = value.length;
    if (key === "SUPABASE_SERVICE_ROLE_KEY") supabaseKeyChars = value.length;
  }
  return {
    loaded: applied > 0 && supabaseUrlChars > 0 && supabaseKeyChars > 0,
    applied,
    appliedNames,
    rowCount: rows.length,
    hasUrlName: keyNames.includes("NEXT_PUBLIC_SUPABASE_URL"),
    hasKeyName: keyNames.includes("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrlChars,
    supabaseKeyChars,
    reason:
      supabaseUrlChars === 0 || supabaseKeyChars === 0
        ? "vercel_decrypt_redacted_or_empty"
        : undefined,
  };
}

async function requireEnv() {
  const currentHost = supabaseHost(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const hasKey =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== "[SENSITIVE]";
  if (currentHost !== PRODUCTION_SUPABASE_HOST || !hasKey) {
    const pulled = await loadProductionEnvFromVercelApi();
    if (!pulled.loaded) {
      throw new Error(
        `Missing Production Supabase credentials (${JSON.stringify({
          reason: pulled.reason || "empty",
          appliedNames: pulled.appliedNames ?? [],
          rowCount: pulled.rowCount ?? 0,
          hasUrlName: pulled.hasUrlName ?? false,
          hasKeyName: pulled.hasKeyName ?? false,
          supabaseUrlChars: pulled.supabaseUrlChars ?? 0,
          supabaseKeyChars: pulled.supabaseKeyChars ?? 0,
        })})`
      );
    }
  }
  const resolvedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const resolvedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!resolvedUrl || !resolvedKey || resolvedUrl === "[SENSITIVE]" || resolvedKey === "[SENSITIVE]") {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY after Vercel decrypt");
  }
  const host = supabaseHost(resolvedUrl);
  if (host !== PRODUCTION_SUPABASE_HOST) {
    throw new Error(`STOP: supabase host is ${host}, expected ${PRODUCTION_SUPABASE_HOST}`);
  }
  return { url: resolvedUrl, key: resolvedKey, host };
}

function adminClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

async function countEq(supabase, table, column, value) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (column && value != null) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) {
    return { count: null, error: error.message, code: error.code };
  }
  return { count: count ?? 0 };
}

async function countIn(supabase, table, column, values) {
  if (!values.length) return { count: 0 };
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in(column, values);
  if (error) return { count: null, error: error.message, code: error.code };
  return { count: count ?? 0 };
}

async function listOrgs(supabase) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, status, deleted_at")
    .is("deleted_at", null);
  if (error) throw new Error(`organizations: ${error.message}`);
  return data ?? [];
}

async function resolveAuthorizedOrg(supabase) {
  const { data: maps, error: mapErr } = await supabase
    .from("horora_nexus_organization_map")
    .select("nexus_organization_id, organization_id, status")
    .eq("nexus_organization_id", NEXUS_ORG)
    .eq("status", "active");
  if (mapErr) throw new Error(`horora_nexus_organization_map: ${mapErr.message}`);
  const active = maps ?? [];
  if (active.length !== 1) {
    return {
      ok: false,
      reason: `expected exactly 1 active map for ${NEXUS_ORG}, found ${active.length}`,
      maps: active.map((row) => ({
        nexus_organization_id: row.nexus_organization_id,
        organization_id: row.organization_id,
        status: row.status,
      })),
    };
  }
  const organizationId = active[0].organization_id;
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, slug, status, deleted_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgErr) throw new Error(`organizations lookup: ${orgErr.message}`);
  if (!org || org.deleted_at || org.status !== "active") {
    return { ok: false, reason: "mapped organization missing or inactive", organizationId };
  }
  return { ok: true, organizationId, slug: org.slug, status: org.status };
}

async function employeeIdsForOrg(supabase, organizationId) {
  const { data, error } = await supabase
    .from("chauffeurs")
    .select("id")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`chauffeurs: ${error.message}`);
  return (data ?? []).map((row) => Number(row.id)).filter((id) => id > 0);
}

async function inventoryForOrg(supabase, organizationId, employeeIds) {
  const byOrg = async (table) => countEq(supabase, table, "organization_id", organizationId);
  const byEmployees = async (table) => countIn(supabase, table, "employee_id", employeeIds);

  const [
    eventsOrg,
    eventsEmp,
    shiftsOrg,
    shiftsEmp,
    exceptionsOrg,
    exceptionsEmp,
    currentOrg,
    currentEmp,
    latenessEmp,
    tokens,
    payrollReports,
    payrollCycles,
    payrollTemplates,
    payrollRecipients,
    payrollDeliveries,
    companies,
    employees,
    memberships,
    identityMaps,
    orgMaps,
    alertConfig,
    punchZones,
    gpsBases,
    orgSettings,
  ] = await Promise.all([
    byOrg("horodateur_events"),
    byEmployees("horodateur_events"),
    byOrg("horodateur_shifts"),
    byEmployees("horodateur_shifts"),
    byOrg("horodateur_exceptions"),
    byEmployees("horodateur_exceptions"),
    byOrg("horodateur_current_state"),
    byEmployees("horodateur_current_state"),
    byEmployees("horodateur_lateness_notifications"),
    countEq(supabase, "horodateur_exception_action_tokens"),
    byOrg("horodateur_payroll_reports"),
    byOrg("horodateur_payroll_cycles"),
    byOrg("horodateur_payroll_cycle_templates"),
    byOrg("horodateur_payroll_recipients"),
    byOrg("horodateur_payroll_deliveries"),
    countEq(supabase, "organization_companies", "organization_id", organizationId),
    countEq(supabase, "chauffeurs", "organization_id", organizationId),
    countEq(supabase, "organization_memberships", "organization_id", organizationId),
    countEq(supabase, "horora_nexus_identity_map", "organization_id", organizationId),
    countEq(supabase, "horora_nexus_organization_map"),
    countEq(supabase, "horodateur_direction_alert_config"),
    byOrg("horodateur_punch_zones"),
    countEq(supabase, "gps_bases"),
    countEq(supabase, "organization_settings", "organization_id", organizationId),
  ]);

  const { count: payrollDrafts, error: draftErr } = await supabase
    .from("horodateur_payroll_reports")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "draft");
  const { count: payrollIssued, error: issuedErr } = await supabase
    .from("horodateur_payroll_reports")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "issued");
  const { count: eventsOtherOrg, error: eventsOtherErr } = await supabase
    .from("horodateur_events")
    .select("id", { count: "exact", head: true })
    .neq("organization_id", organizationId);
  const { count: eventsNullOrg, error: eventsNullErr } = await supabase
    .from("horodateur_events")
    .select("id", { count: "exact", head: true })
    .is("organization_id", null);

  const { count: appAlerts, error: alertErr } = await supabase
    .from("app_alerts")
    .select("id", { count: "exact", head: true })
    .eq("source_module", "horodateur");
  const { count: smsLogs, error: smsErr } = await supabase
    .from("sms_alerts_log")
    .select("id", { count: "exact", head: true })
    .like("alert_type", "horodateur%");

  return {
    organizationId,
    employeeIdCount: employeeIds.length,
    operational: {
      horodateur_events_by_org: eventsOrg,
      horodateur_events_by_employee: eventsEmp,
      horodateur_shifts_by_org: shiftsOrg,
      horodateur_shifts_by_employee: shiftsEmp,
      horodateur_exceptions_by_org: exceptionsOrg,
      horodateur_exceptions_by_employee: exceptionsEmp,
      horodateur_current_state_by_org: currentOrg,
      horodateur_current_state_by_employee: currentEmp,
      horodateur_lateness_notifications_by_employee: latenessEmp,
      horodateur_exception_action_tokens_all: tokens,
      horodateur_payroll_reports_by_org: payrollReports,
      horodateur_payroll_reports_draft: { count: payrollDrafts ?? null, error: draftErr?.message ?? null },
      horodateur_payroll_reports_issued: { count: payrollIssued ?? null, error: issuedErr?.message ?? null },
      horodateur_payroll_cycles_by_org: payrollCycles,
      horodateur_payroll_deliveries_by_org: payrollDeliveries,
      horodateur_events_other_org: { count: eventsOtherOrg ?? null, error: eventsOtherErr?.message ?? null },
      horodateur_events_null_org: { count: eventsNullOrg ?? null, error: eventsNullErr?.message ?? null },
      app_alerts_source_horodateur: { count: appAlerts ?? null, error: alertErr?.message ?? null },
      sms_alerts_log_horodateur: { count: smsLogs ?? null, error: smsErr?.message ?? null },
    },
    preserve: {
      chauffeurs: employees,
      organization_companies: companies,
      organization_memberships: memberships,
      horora_nexus_identity_map: identityMaps,
      horora_nexus_organization_map: orgMaps,
      organization_settings: orgSettings,
      horodateur_direction_alert_config: alertConfig,
      horodateur_payroll_cycle_templates: payrollTemplates,
      horodateur_payroll_recipients: payrollRecipients,
      horodateur_punch_zones: punchZones,
      gps_bases: gpsBases,
    },
  };
}

function scopeConflict(inv) {
  const mismatches = [];
  const eventsNull = inv.operational.horodateur_events_null_org?.count;
  if (typeof eventsNull === "number" && eventsNull > 0) {
    mismatches.push(`events with null organization_id=${eventsNull}`);
  }
  const pairs = [
    ["events", inv.operational.horodateur_events_by_org, inv.operational.horodateur_events_by_employee],
    ["shifts", inv.operational.horodateur_shifts_by_org, inv.operational.horodateur_shifts_by_employee],
    ["exceptions", inv.operational.horodateur_exceptions_by_org, inv.operational.horodateur_exceptions_by_employee],
  ];
  for (const [name, byOrg, byEmp] of pairs) {
    if (byOrg.count == null || byEmp.count == null) {
      mismatches.push(`${name}: count query failed`);
      continue;
    }
    if (byOrg.count !== byEmp.count) {
      mismatches.push(`${name}: org=${byOrg.count} employee=${byEmp.count}`);
    }
  }
  return mismatches;
}

async function fetchAll(supabase, table, filter) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  for (;;) {
    let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
    query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function backupDir() {
  const dir = join(process.cwd(), "tmp-backups", "horora-operational-reset");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function encryptJson(payload, password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from("HOR1"),
    salt,
    iv,
    tag,
    encrypted,
  ]);
}

function decryptJson(buf, password) {
  const magic = buf.subarray(0, 4).toString("utf8");
  if (magic !== "HOR1") throw new Error("invalid backup magic");
  const salt = buf.subarray(4, 20);
  const iv = buf.subarray(20, 32);
  const tag = buf.subarray(32, 48);
  const encrypted = buf.subarray(48);
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(json);
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function buildBackupPayload(supabase, organizationId, employeeIds) {
  const filterOrg = (q) => q.eq("organization_id", organizationId);
  const filterEmp = (q) => q.in("employee_id", employeeIds.length ? employeeIds : [-1]);
  const [
    events,
    shifts,
    exceptions,
    currentState,
    lateness,
    payrollReports,
    payrollDeliveries,
    payrollCycles,
  ] = await Promise.all([
    fetchAll(supabase, "horodateur_events", filterOrg),
    fetchAll(supabase, "horodateur_shifts", filterOrg),
    fetchAll(supabase, "horodateur_exceptions", filterOrg),
    fetchAll(supabase, "horodateur_current_state", filterOrg),
    fetchAll(supabase, "horodateur_lateness_notifications", filterEmp),
    fetchAll(supabase, "horodateur_payroll_reports", (q) =>
      q.eq("organization_id", organizationId).eq("status", "draft")
    ),
    fetchAll(supabase, "horodateur_payroll_deliveries", filterOrg),
    fetchAll(supabase, "horodateur_payroll_cycles", filterOrg),
  ]);

  const exceptionIds = exceptions.map((row) => row.id);
  const tokens = exceptionIds.length
    ? await fetchAll(supabase, "horodateur_exception_action_tokens", (q) =>
        q.in("exception_id", exceptionIds)
      )
    : [];

  let appAlerts = [];
  const alertsRes = await supabase
    .from("app_alerts")
    .select("*")
    .eq("source_module", "horodateur");
  if (!alertsRes.error) appAlerts = alertsRes.data ?? [];

  const alertIds = appAlerts.map((row) => row.id);
  let deliveries = [];
  if (alertIds.length) {
    const delRes = await supabase.from("app_alert_deliveries").select("*").in("alert_id", alertIds);
    if (!delRes.error) deliveries = delRes.data ?? [];
  }

  let smsLogs = [];
  const smsRes = await supabase.from("sms_alerts_log").select("*").like("alert_type", "horodateur%");
  if (!smsRes.error) smsLogs = smsRes.data ?? [];

  const counts = {
    horodateur_events: events.length,
    horodateur_shifts: shifts.length,
    horodateur_exceptions: exceptions.length,
    horodateur_current_state: currentState.length,
    horodateur_lateness_notifications: lateness.length,
    horodateur_exception_action_tokens: tokens.length,
    horodateur_payroll_reports: payrollReports.length,
    horodateur_payroll_deliveries: payrollDeliveries.length,
    horodateur_payroll_cycles: payrollCycles.length,
    app_alerts: appAlerts.length,
    app_alert_deliveries: deliveries.length,
    sms_alerts_log: smsLogs.length,
  };

  return {
    meta: {
      organizationId,
      createdAt: new Date().toISOString(),
      employeeIdCount: employeeIds.length,
      counts,
    },
    tables: {
      horodateur_events: events,
      horodateur_shifts: shifts,
      horodateur_exceptions: exceptions,
      horodateur_current_state: currentState,
      horodateur_lateness_notifications: lateness,
      horodateur_exception_action_tokens: tokens,
      horodateur_payroll_reports: payrollReports,
      horodateur_payroll_deliveries: payrollDeliveries,
      horodateur_payroll_cycles: payrollCycles,
      app_alerts: appAlerts,
      app_alert_deliveries: deliveries,
      sms_alerts_log: smsLogs,
    },
  };
}

async function scopedDelete(supabase, table, column, values) {
  if (!values.length) return { table, deleted: 0 };
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in(column, values);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  return { table, deleted: count ?? 0 };
}

async function scopedDeleteEq(supabase, table, column, value) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq(column, value);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  return { table, deleted: count ?? 0 };
}

async function main() {
  const { host, url, key } = await requireEnv();
  const supabase = adminClient(url, key);
  const orgs = await listOrgs(supabase);
  const authorized = await resolveAuthorizedOrg(supabase);

  const inventoryBase = {
    phase: PHASE,
    supabaseHost: host,
    organizationCount: orgs.length,
    organizations: orgs.map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
    })),
    authorized,
  };

  if (!authorized.ok) {
    console.log(JSON.stringify({ ...inventoryBase, STOP: true }, null, 2));
    process.exit(2);
  }

  const employeeIds = await employeeIdsForOrg(supabase, authorized.organizationId);
  const inv = await inventoryForOrg(supabase, authorized.organizationId, employeeIds);
  const conflicts = scopeConflict(inv);
  const report = {
    ...inventoryBase,
    inventory: inv,
    scopeConflicts: conflicts,
  };

  if (PHASE === "inventory") {
    console.log(JSON.stringify(report, null, 2));
    if (conflicts.length) process.exit(2);
    return;
  }

  if (conflicts.length) {
    console.log(JSON.stringify({ ...report, STOP: true, reason: "tenant scoping uncertain" }, null, 2));
    process.exit(2);
  }

  if (PHASE === "backup" || PHASE === "rollback-test" || PHASE === "execute") {
    const password =
      process.env.HORORA_RESET_BACKUP_PASSWORD || randomBytes(32).toString("hex");
    const payload = await buildBackupPayload(supabase, authorized.organizationId, employeeIds);
    const encrypted = encryptJson(payload, password);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = backupDir();
    const file = join(dir, `horora-operational-${stamp}.bin`);
    writeFileSync(file, encrypted);
    const hash = sha256(encrypted);
    const keyFile = join(dir, `horora-operational-${stamp}.key`);
    if (!process.env.HORORA_RESET_BACKUP_PASSWORD) {
      writeFileSync(keyFile, password, { encoding: "utf8" });
    }
    const roundTrip = decryptJson(readFileSync(file), password);
    const verified =
      JSON.stringify(roundTrip.meta.counts) === JSON.stringify(payload.meta.counts) &&
      roundTrip.tables.horodateur_events.length === payload.tables.horodateur_events.length;

    const backupReport = {
      ...report,
      backup: {
        created: true,
        verified,
        location: file,
        keyLocation: existsSync(keyFile) ? keyFile : "HORORA_RESET_BACKUP_PASSWORD",
        sha256: hash,
        counts: payload.meta.counts,
        bytes: encrypted.length,
      },
    };

    if (!verified) {
      console.log(JSON.stringify({ ...backupReport, STOP: true, reason: "backup verification failed" }, null, 2));
      process.exit(2);
    }

    if (PHASE === "backup") {
      console.log(JSON.stringify(backupReport, null, 2));
      return;
    }

    if (PHASE === "rollback-test") {
      const restored = decryptJson(readFileSync(file), password);
      const scratch = restored.tables.horodateur_events.slice(0, Math.min(3, restored.tables.horodateur_events.length));
      const backupEmployeeIds = [
        ...new Set(restored.tables.horodateur_events.map((row) => Number(row.employee_id)).filter((id) => id > 0)),
      ];
      const { count: stillEmployees, error: empErr } = await supabase
        .from("chauffeurs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", authorized.organizationId)
        .in("id", backupEmployeeIds.length ? backupEmployeeIds : [-1]);
      const { count: stillCompanies, error: coErr } = await supabase
        .from("organization_companies")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", authorized.organizationId);
      const { count: stillIdentities, error: idErr } = await supabase
        .from("horora_nexus_identity_map")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", authorized.organizationId);
      const rollbackTest = {
        decodedEventCount: restored.tables.horodateur_events.length,
        sampleRestoreCount: scratch.length,
        sampleHasIds: scratch.every((row) => typeof row.id === "string" && row.id.length > 0),
        countsMatchBackup: JSON.stringify(restored.meta.counts) === JSON.stringify(payload.meta.counts),
        restoreOrder: [
          "horodateur_shifts",
          "horodateur_events",
          "horodateur_current_state",
          "horodateur_exceptions",
          "horodateur_exception_action_tokens",
          "horodateur_lateness_notifications",
          "horodateur_payroll_reports",
          "horodateur_payroll_deliveries",
          "app_alerts",
          "app_alert_deliveries",
          "sms_alerts_log",
        ],
        fkEmployeesPresent: empErr ? empErr.message : stillEmployees === backupEmployeeIds.length,
        fkCompaniesPresent: !coErr && (stillCompanies ?? 0) > 0,
        fkIdentitiesPresent: !idErr && (stillIdentities ?? 0) > 0,
        backupFile: file,
        backupSha256: hash,
      };
      console.log(JSON.stringify({ ...backupReport, rollbackTest }, null, 2));
      if (
        !rollbackTest.countsMatchBackup ||
        (scratch.length > 0 && !rollbackTest.sampleHasIds) ||
        rollbackTest.fkEmployeesPresent !== true ||
        rollbackTest.fkCompaniesPresent !== true
      ) {
        process.exit(2);
      }
      return;
    }

    if (PHASE === "execute") {
      if (process.env.HORORA_RESET_CONFIRM !== "HORORA_OPERATIONAL_RESET") {
        console.log(JSON.stringify({ ...backupReport, STOP: true, reason: "missing HORORA_RESET_CONFIRM" }, null, 2));
        process.exit(2);
      }
      if (process.env.HORORA_RESET_ORG_ID !== authorized.organizationId) {
        console.log(JSON.stringify({ ...backupReport, STOP: true, reason: "HORORA_RESET_ORG_ID mismatch" }, null, 2));
        process.exit(2);
      }

      const eventIds = payload.tables.horodateur_events.map((row) => row.id);
      const shiftIds = payload.tables.horodateur_shifts.map((row) => row.id);
      const exceptionIds = payload.tables.horodateur_exceptions.map((row) => row.id);
      const alertIds = payload.tables.app_alerts.map((row) => row.id);
      const tokenIds = payload.tables.horodateur_exception_action_tokens
        .filter((row) => exceptionIds.includes(row.exception_id))
        .map((row) => row.id);
      const latenessIds = payload.tables.horodateur_lateness_notifications.map((row) => row.id);
      const reportIds = payload.tables.horodateur_payroll_reports.map((row) => row.id);
      const payrollDeliveryIds = (payload.tables.horodateur_payroll_deliveries ?? []).map((row) => row.id);
      const smsIds = payload.tables.sms_alerts_log.map((row) => row.id);
      const deliveryIds = payload.tables.app_alert_deliveries.map((row) => row.id);
      const currentIds = payload.tables.horodateur_current_state.map((row) => row.id);

      const deleted = [];
      try {
        if (deliveryIds.length) deleted.push(await scopedDelete(supabase, "app_alert_deliveries", "id", deliveryIds));
        if (alertIds.length) deleted.push(await scopedDelete(supabase, "app_alerts", "id", alertIds));
        if (smsIds.length) deleted.push(await scopedDelete(supabase, "sms_alerts_log", "id", smsIds));
        if (tokenIds.length) deleted.push(await scopedDelete(supabase, "horodateur_exception_action_tokens", "id", tokenIds));
        if (exceptionIds.length) deleted.push(await scopedDelete(supabase, "horodateur_exceptions", "id", exceptionIds));
        if (latenessIds.length) deleted.push(await scopedDelete(supabase, "horodateur_lateness_notifications", "id", latenessIds));
        if (payrollDeliveryIds.length) deleted.push(await scopedDelete(supabase, "horodateur_payroll_deliveries", "id", payrollDeliveryIds));
        if (reportIds.length) deleted.push(await scopedDelete(supabase, "horodateur_payroll_reports", "id", reportIds));
        if (currentIds.length) deleted.push(await scopedDelete(supabase, "horodateur_current_state", "id", currentIds));
        if (eventIds.length) {
          const { error: nullRelated } = await supabase
            .from("horodateur_events")
            .update({ related_event_id: null })
            .in("id", eventIds)
            .not("related_event_id", "is", null);
          if (nullRelated) throw new Error(`null related_event_id: ${nullRelated.message}`);
          deleted.push(await scopedDelete(supabase, "horodateur_events", "id", eventIds));
        }
        if (shiftIds.length) deleted.push(await scopedDelete(supabase, "horodateur_shifts", "id", shiftIds));
      } catch (error) {
        throw new Error(
          `scoped delete failed (${error instanceof Error ? error.message : String(error)}). Restore from backup ${file}`
        );
      }

      const cutoverAt = new Date().toISOString();
      const { data: settings, error: settingsReadErr } = await supabase
        .from("organization_settings")
        .select("operational_policies")
        .eq("organization_id", authorized.organizationId)
        .maybeSingle();
      const policies = {
        ...((settings?.operational_policies && typeof settings.operational_policies === "object")
          ? settings.operational_policies
          : {}),
        horodateur_operational_cutover_at: cutoverAt,
      };
      let cutoverErr = settingsReadErr;
      if (!cutoverErr) {
        if (settings) {
          const upd = await supabase
            .from("organization_settings")
            .update({ operational_policies: policies })
            .eq("organization_id", authorized.organizationId);
          cutoverErr = upd.error;
        } else {
          const ins = await supabase.from("organization_settings").insert({
            organization_id: authorized.organizationId,
            timezone: "America/Toronto",
            locale: "fr-CA",
            currency: "CAD",
            operational_policies: policies,
          });
          cutoverErr = ins.error;
        }
      }
      const post = await inventoryForOrg(supabase, authorized.organizationId, employeeIds);

      console.log(JSON.stringify({
        ...backupReport,
        execute: {
          deleted,
          cutoverAt,
          cutoverWriteError: cutoverErr?.message ?? null,
        },
        postReset: post,
      }, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
