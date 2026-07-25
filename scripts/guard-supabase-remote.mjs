#!/usr/bin/env node
/**
 * TAGORA Time — garde des opérations Supabase distantes.
 * Dry-run par défaut. Aucune commande distante sans --execute et validations.
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const EXIT = Object.freeze({
  OK: 0,
  PRODUCTION: 2,
  UNKNOWN_ENV_OR_REF: 3,
  SCHEMA_EMPTY: 4,
  BRANCH: 5,
  DIRTY_MIGRATIONS: 6,
  CONFIRM: 7,
  INVALID_ARGS: 8,
  DEPENDENCY: 9,
  UNEXPECTED: 10,
});

export const PRODUCTION_PROJECT_REF = "qcgvzdlfsxybrmloijpt";
export const STAGING_PROJECT_REF = "qokyobcvplzufshydhih";
export const ALLOWED_BRANCHES = Object.freeze([
  "feature/admin-commissions-premium-header-kpi",
  "main",
]);
export const ALLOWED_OPS = Object.freeze([
  "link-staging",
  "db-push-staging",
  "query-readonly",
  "check-only",
]);
export const ALLOWED_ENVS = Object.freeze(["local", "staging"]);

export const CONFIRM_DB_PUSH_STAGING = `STAGING-DB-PUSH-${STAGING_PROJECT_REF}`;
export const CONFIRM_LINK_STAGING = `LINK-STAGING-${STAGING_PROJECT_REF}`;

export const PRODUCTION_BLOCKED_MESSAGE =
  "PRODUCTION BLOCKED — remote Supabase operations are forbidden for this project.";

const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g,
  /(?:password|passwd|secret|token|api[_-]?key)\s*=\s*\S+/gi,
  /DATABASE_URL\s*=\s*\S+/gi,
  /service[_-]?role[^\s]*/gi,
];

function redact(text) {
  let out = String(text ?? "");
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function parseArgs(argv) {
  const result = {
    op: null,
    env: null,
    confirm: null,
    execute: false,
    projectRefArg: null,
    raw: [...argv],
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      result.execute = true;
      continue;
    }
    if (arg.startsWith("--op=")) {
      result.op = arg.slice("--op=".length).trim();
      continue;
    }
    if (arg.startsWith("--env=")) {
      result.env = arg.slice("--env=".length).trim();
      continue;
    }
    if (arg.startsWith("--confirm=")) {
      result.confirm = arg.slice("--confirm=".length);
      continue;
    }
    if (arg.startsWith("--project-ref=")) {
      result.projectRefArg = arg.slice("--project-ref=".length).trim();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.op = result.op ?? "help";
      continue;
    }
  }

  return result;
}

function containsProductionRef(...values) {
  return values.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().includes(PRODUCTION_PROJECT_REF)
  );
}

export function createDefaultDeps(repoRoot) {
  const root = repoRoot ?? process.cwd();
  const projectRefPath = path.join(root, "supabase", ".temp", "project-ref");

  return {
    repoRoot: root,
    readProjectRef() {
      if (!existsSync(projectRefPath)) {
        return null;
      }
      return readFileSync(projectRefPath, "utf8").trim();
    },
    getGitBranch() {
      const result = spawnSync("git", ["branch", "--show-current"], {
        cwd: root,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        throw new Error("Unable to resolve git branch");
      }
      return String(result.stdout ?? "").trim();
    },
    getMigrationDirtyStatus() {
      const result = spawnSync(
        "git",
        ["status", "--porcelain", "--", "supabase/migrations"],
        { cwd: root, encoding: "utf8" }
      );
      if (result.status !== 0) {
        throw new Error("Unable to inspect supabase/migrations git status");
      }
      const output = String(result.stdout ?? "").trim();
      return {
        dirty: output.length > 0,
        details: output ? "dirty" : "clean",
      };
    },
    async countRemoteMigrations() {
      // Never used in dry-run. Real --execute path is intentionally not
      // wired to a live network call in A2 Phase 1 default deps beyond spawn.
      const sql =
        "BEGIN TRANSACTION READ ONLY; SELECT count(*)::int AS c FROM supabase_migrations.schema_migrations; ROLLBACK;";
      const result = spawnSync(
        "supabase",
        ["db", "query", "--linked", "-o", "json", sql],
        { cwd: root, encoding: "utf8" }
      );
      if (result.status !== 0) {
        const err = new Error("Unable to read schema_migrations count");
        err.code = "SCHEMA_QUERY_FAILED";
        throw err;
      }
      const raw = String(result.stdout ?? "");
      const start = raw.indexOf("{");
      const alt = raw.indexOf("[");
      const idx =
        start >= 0 && (alt < 0 || start < alt)
          ? start
          : alt >= 0
            ? alt
            : -1;
      if (idx < 0) {
        const err = new Error("Unable to parse schema_migrations count");
        err.code = "SCHEMA_QUERY_FAILED";
        throw err;
      }
      const parsed = JSON.parse(raw.slice(idx));
      if (Array.isArray(parsed)) {
        return Number(parsed[0]?.c ?? parsed[0]?.count ?? 0);
      }
      if (parsed.rows?.[0]) {
        return Number(parsed.rows[0].c ?? parsed.rows[0].count ?? 0);
      }
      return Number(parsed.c ?? parsed.count ?? 0);
    },
    async runCommand(command, args) {
      const result = spawnSync(command, args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        status: result.status ?? 1,
        stdout: redact(result.stdout ?? ""),
        stderr: redact(result.stderr ?? ""),
      };
    },
  };
}

function logLine(lines, message) {
  lines.push(message);
}

function decideRefuse(lines, exitCode, reason) {
  logLine(lines, `decision=REFUSE`);
  logLine(lines, `reason=${reason}`);
  logLine(lines, `exit=${exitCode}`);
  return {
    exitCode,
    lines,
    plannedCommand: null,
    executorCalled: false,
  };
}

/**
 * @param {object} input
 * @param {ReturnType<typeof parseArgs>} input.args
 * @param {object} input.deps
 */
export async function runGuard({ args, deps }) {
  const lines = [];
  try {
    const op = args.op;
    const env = args.env;
    const execute = Boolean(args.execute);
    const mode = execute ? "execute" : "dry-run";

    logLine(lines, `operation=${op ?? "(missing)"}`);
    logLine(lines, `environment=${env ?? "(missing)"}`);
    logLine(lines, `mode=${mode}`);

    if (!op || op === "help") {
      return decideRefuse(
        lines,
        EXIT.INVALID_ARGS,
        "missing or invalid --op (allowed: link-staging|db-push-staging|query-readonly|check-only)"
      );
    }

    if (!ALLOWED_OPS.includes(op)) {
      return decideRefuse(lines, EXIT.INVALID_ARGS, `unknown operation: ${op}`);
    }

    if (!env) {
      return decideRefuse(lines, EXIT.INVALID_ARGS, "missing --env");
    }

    if (env === "production" || containsProductionRef(env)) {
      logLine(lines, PRODUCTION_BLOCKED_MESSAGE);
      return decideRefuse(lines, EXIT.PRODUCTION, "production environment forbidden");
    }

    if (!ALLOWED_ENVS.includes(env)) {
      return decideRefuse(lines, EXIT.UNKNOWN_ENV_OR_REF, `unknown environment: ${env}`);
    }

    if (
      containsProductionRef(
        args.projectRefArg,
        args.confirm,
        ...(args.raw ?? [])
      )
    ) {
      logLine(lines, PRODUCTION_BLOCKED_MESSAGE);
      return decideRefuse(
        lines,
        EXIT.PRODUCTION,
        "production project ref present in arguments"
      );
    }

    if (
      args.projectRefArg &&
      args.projectRefArg !== STAGING_PROJECT_REF &&
      args.projectRefArg !== PRODUCTION_PROJECT_REF
    ) {
      return decideRefuse(
        lines,
        EXIT.UNKNOWN_ENV_OR_REF,
        `unknown project ref argument: ${args.projectRefArg}`
      );
    }

    let activeRef = null;
    try {
      activeRef = deps.readProjectRef();
    } catch {
      return decideRefuse(
        lines,
        EXIT.DEPENDENCY,
        "unable to read supabase/.temp/project-ref"
      );
    }

    if (activeRef) {
      logLine(lines, `project_ref=${activeRef}`);
    } else {
      logLine(lines, "project_ref=(absent)");
    }

    if (activeRef === PRODUCTION_PROJECT_REF) {
      logLine(lines, PRODUCTION_BLOCKED_MESSAGE);
      return decideRefuse(lines, EXIT.PRODUCTION, "active project ref is production");
    }

    if (
      args.projectRefArg === PRODUCTION_PROJECT_REF ||
      (args.projectRefArg && containsProductionRef(args.projectRefArg))
    ) {
      logLine(lines, PRODUCTION_BLOCKED_MESSAGE);
      return decideRefuse(lines, EXIT.PRODUCTION, "requested project ref is production");
    }

    const requiresRemoteLink = op === "db-push-staging" || op === "query-readonly";
    const isRemoteWrite = op === "db-push-staging" || op === "link-staging";

    if (env === "staging" && op !== "check-only") {
      // staging ops must stay on whitelist
    }

    if (requiresRemoteLink) {
      if (!activeRef) {
        return decideRefuse(
          lines,
          EXIT.UNKNOWN_ENV_OR_REF,
          "project-ref file absent; link staging first via guarded link-staging"
        );
      }
      if (activeRef !== STAGING_PROJECT_REF) {
        if (activeRef === PRODUCTION_PROJECT_REF) {
          logLine(lines, PRODUCTION_BLOCKED_MESSAGE);
          return decideRefuse(lines, EXIT.PRODUCTION, "active project ref is production");
        }
        return decideRefuse(
          lines,
          EXIT.UNKNOWN_ENV_OR_REF,
          `active project ref not in whitelist: ${activeRef}`
        );
      }
    }

    if (op === "link-staging") {
      if (env !== "staging") {
        return decideRefuse(
          lines,
          EXIT.UNKNOWN_ENV_OR_REF,
          "link-staging requires --env=staging"
        );
      }
      if (activeRef && activeRef !== STAGING_PROJECT_REF) {
        return decideRefuse(
          lines,
          EXIT.UNKNOWN_ENV_OR_REF,
          `cannot link-staging while active ref is ${activeRef}`
        );
      }
    }

    if (op === "db-push-staging" && env !== "staging") {
      return decideRefuse(
        lines,
        EXIT.UNKNOWN_ENV_OR_REF,
        "db-push-staging requires --env=staging"
      );
    }

    if (op === "query-readonly" && env !== "staging") {
      return decideRefuse(
        lines,
        EXIT.UNKNOWN_ENV_OR_REF,
        "query-readonly requires --env=staging"
      );
    }

    let branch;
    try {
      branch = deps.getGitBranch();
    } catch {
      return decideRefuse(lines, EXIT.DEPENDENCY, "git branch unavailable");
    }
    logLine(lines, `branch=${branch || "(empty)"}`);

    if (op !== "check-only" || env === "staging") {
      if (!ALLOWED_BRANCHES.includes(branch)) {
        return decideRefuse(lines, EXIT.BRANCH, `branch not allowed: ${branch}`);
      }
    } else if (env === "local" && op === "check-only") {
      if (branch && !ALLOWED_BRANCHES.includes(branch)) {
        return decideRefuse(lines, EXIT.BRANCH, `branch not allowed: ${branch}`);
      }
    }

    if (isRemoteWrite || op === "db-push-staging") {
      let migrationStatus;
      try {
        migrationStatus = deps.getMigrationDirtyStatus();
      } catch {
        return decideRefuse(
          lines,
          EXIT.DEPENDENCY,
          "unable to inspect supabase/migrations"
        );
      }
      logLine(lines, `migrations=${migrationStatus.details}`);
      if (migrationStatus.dirty) {
        return decideRefuse(
          lines,
          EXIT.DIRTY_MIGRATIONS,
          "uncontrolled changes under supabase/migrations"
        );
      }
    } else {
      logLine(lines, "migrations=(not-checked)");
    }

    if (op === "db-push-staging" || op === "link-staging") {
      const expected =
        op === "db-push-staging"
          ? CONFIRM_DB_PUSH_STAGING
          : CONFIRM_LINK_STAGING;
      if (args.confirm !== expected) {
        return decideRefuse(
          lines,
          EXIT.CONFIRM,
          "missing or incorrect --confirm"
        );
      }
      logLine(lines, "confirm=ok");
    }

    if (op === "db-push-staging" && execute) {
      let count;
      try {
        count = await deps.countRemoteMigrations();
      } catch {
        return decideRefuse(
          lines,
          EXIT.SCHEMA_EMPTY,
          "schema_migrations inaccessible"
        );
      }
      logLine(lines, `schema_migrations_count=${count}`);
      if (!Number.isFinite(count) || count <= 0) {
        return decideRefuse(
          lines,
          EXIT.SCHEMA_EMPTY,
          "schema_migrations is empty"
        );
      }
    }

    let plannedCommand = null;
    if (op === "link-staging") {
      plannedCommand = {
        command: "supabase",
        args: ["link", "--project-ref", STAGING_PROJECT_REF],
      };
    } else if (op === "db-push-staging") {
      plannedCommand = {
        command: "supabase",
        args: ["db", "push"],
      };
    } else if (op === "query-readonly") {
      plannedCommand = {
        command: "supabase",
        args: [
          "db",
          "query",
          "--linked",
          "-o",
          "json",
          "BEGIN TRANSACTION READ ONLY; SELECT count(*)::int AS c FROM supabase_migrations.schema_migrations; ROLLBACK;",
        ],
      };
    } else if (op === "check-only") {
      plannedCommand = null;
    }

    if (plannedCommand) {
      logLine(
        lines,
        `planned_command=${plannedCommand.command} ${plannedCommand.args.join(" ")}`
      );
    } else {
      logLine(lines, "planned_command=(none)");
    }

    if (!execute) {
      logLine(lines, "DRY RUN — no remote command executed.");
      logLine(lines, "decision=PASS");
      logLine(lines, `exit=${EXIT.OK}`);
      return {
        exitCode: EXIT.OK,
        lines,
        plannedCommand,
        executorCalled: false,
      };
    }

    if (op === "check-only") {
      logLine(lines, "decision=PASS");
      logLine(lines, `exit=${EXIT.OK}`);
      return {
        exitCode: EXIT.OK,
        lines,
        plannedCommand: null,
        executorCalled: false,
      };
    }

    if (!plannedCommand) {
      return decideRefuse(lines, EXIT.UNEXPECTED, "no command to execute");
    }

    const result = await deps.runCommand(
      plannedCommand.command,
      plannedCommand.args
    );
    logLine(lines, `executor_status=${result.status}`);
    if ((result.stdout || "").trim()) {
      logLine(lines, `executor_stdout=${redact(result.stdout).slice(0, 500)}`);
    }
    if ((result.stderr || "").trim()) {
      logLine(lines, `executor_stderr=${redact(result.stderr).slice(0, 500)}`);
    }

    if (result.status !== 0) {
      return decideRefuse(
        lines,
        EXIT.DEPENDENCY,
        "remote command failed after validation"
      );
    }

    logLine(lines, "decision=PASS");
    logLine(lines, `exit=${EXIT.OK}`);
    return {
      exitCode: EXIT.OK,
      lines,
      plannedCommand,
      executorCalled: true,
    };
  } catch (error) {
    logLine(lines, "decision=REFUSE");
    logLine(lines, `reason=unexpected:${redact(error?.message ?? "error")}`);
    logLine(lines, `exit=${EXIT.UNEXPECTED}`);
    return {
      exitCode: EXIT.UNEXPECTED,
      lines,
      plannedCommand: null,
      executorCalled: false,
    };
  }
}

export async function main(argv = process.argv.slice(2), deps = createDefaultDeps()) {
  const args = parseArgs(argv);
  const result = await runGuard({ args, deps });
  for (const line of result.lines) {
    console.log(redact(line));
  }
  return result.exitCode;
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error(redact(error?.message ?? "unexpected error"));
      process.exit(EXIT.UNEXPECTED);
    });
}
