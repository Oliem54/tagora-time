import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRM_DB_PUSH_STAGING,
  CONFIRM_LINK_STAGING,
  EXIT,
  PRODUCTION_BLOCKED_MESSAGE,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  parseArgs,
  runGuard,
} from "./guard-supabase-remote.mjs";

function createMockDeps(overrides = {}) {
  const calls = [];
  const deps = {
    readProjectRef: () => STAGING_PROJECT_REF,
    getGitBranch: () => "feature/admin-commissions-premium-header-kpi",
    getMigrationDirtyStatus: () => ({ dirty: false, details: "clean" }),
    countRemoteMigrations: async () => 79,
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: "", stderr: "" };
    },
    ...overrides,
  };
  return { deps, calls };
}

async function run(args, depsOverrides = {}) {
  const { deps, calls } = createMockDeps(depsOverrides);
  const parsed =
    Array.isArray(args) ? parseArgs(args) : { ...parseArgs([]), ...args };
  const result = await runGuard({ args: parsed, deps });
  return { result, calls, output: result.lines.join("\n") };
}

describe("guard-supabase-remote", () => {
  it("1. production active project ref → exit 2, executor never called", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: true,
        raw: [],
      },
      { readProjectRef: () => PRODUCTION_PROJECT_REF }
    );
    assert.equal(result.exitCode, EXIT.PRODUCTION);
    assert.equal(calls.length, 0);
    assert.match(result.lines.join("\n"), /PRODUCTION BLOCKED/);
  });

  it("2. production requested as target → exit 2", async () => {
    const { result, calls } = await run({
      op: "db-push-staging",
      env: "staging",
      confirm: CONFIRM_DB_PUSH_STAGING,
      projectRefArg: PRODUCTION_PROJECT_REF,
      execute: false,
      raw: [`--project-ref=${PRODUCTION_PROJECT_REF}`],
    });
    assert.equal(result.exitCode, EXIT.PRODUCTION);
    assert.equal(calls.length, 0);
  });

  it("3. unknown project ref → exit 3", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: false,
        raw: [],
      },
      { readProjectRef: () => "abcdefghijklmnopqrab" }
    );
    assert.equal(result.exitCode, EXIT.UNKNOWN_ENV_OR_REF);
    assert.equal(calls.length, 0);
  });

  it("4. staging without confirmation → exit 7", async () => {
    const { result, calls } = await run({
      op: "db-push-staging",
      env: "staging",
      confirm: null,
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.CONFIRM);
    assert.equal(calls.length, 0);
  });

  it("5. staging with incorrect confirmation → exit 7", async () => {
    const { result, calls } = await run({
      op: "db-push-staging",
      env: "staging",
      confirm: "STAGING-DB-PUSH-wrong",
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.CONFIRM);
    assert.equal(calls.length, 0);
  });

  it("6. staging with exact confirmation → continues past confirm", async () => {
    const { result, output } = await run({
      op: "db-push-staging",
      env: "staging",
      confirm: CONFIRM_DB_PUSH_STAGING,
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.OK);
    assert.match(output, /confirm=ok/);
  });

  it("7. schema_migrations empty → exit 4, db push never called", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: true,
        raw: [],
      },
      { countRemoteMigrations: async () => 0 }
    );
    assert.equal(result.exitCode, EXIT.SCHEMA_EMPTY);
    assert.equal(calls.length, 0);
  });

  it("8. schema_migrations > 0 → history check passes", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: true,
        raw: [],
      },
      { countRemoteMigrations: async () => 79 }
    );
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ["db", "push"]);
  });

  it("9. forbidden branch → exit 5", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: false,
        raw: [],
      },
      { getGitBranch: () => "feature/evil-branch" }
    );
    assert.equal(result.exitCode, EXIT.BRANCH);
    assert.equal(calls.length, 0);
  });

  it("10. modified tracked migration → exit 6", async () => {
    const { result, calls } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: false,
        raw: [],
      },
      {
        getMigrationDirtyStatus: () => ({
          dirty: true,
          details: " M supabase/migrations/x.sql",
        }),
      }
    );
    assert.equal(result.exitCode, EXIT.DIRTY_MIGRATIONS);
    assert.equal(calls.length, 0);
  });

  it("11. untracked migration → exit 6", async () => {
    const { result, calls } = await run(
      {
        op: "link-staging",
        env: "staging",
        confirm: CONFIRM_LINK_STAGING,
        execute: false,
        raw: [],
      },
      {
        getMigrationDirtyStatus: () => ({
          dirty: true,
          details: "?? supabase/migrations/new.sql",
        }),
      }
    );
    assert.equal(result.exitCode, EXIT.DIRTY_MIGRATIONS);
    assert.equal(calls.length, 0);
  });

  it("12. clean migrations → check passes", async () => {
    const { result, output } = await run({
      op: "link-staging",
      env: "staging",
      confirm: CONFIRM_LINK_STAGING,
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.OK);
    assert.match(output, /migrations=clean/);
  });

  it("13. dry-run → exit 0 and no remote command", async () => {
    const { result, calls, output } = await run({
      op: "db-push-staging",
      env: "staging",
      confirm: CONFIRM_DB_PUSH_STAGING,
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(calls.length, 0);
    assert.match(output, /DRY RUN — no remote command executed/);
  });

  it("14. fully simulated execute → executor called once with expected args", async () => {
    const { result, calls } = await run(
      {
        op: "link-staging",
        env: "staging",
        confirm: CONFIRM_LINK_STAGING,
        execute: true,
        raw: [],
      },
      { readProjectRef: () => null }
    );
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "supabase");
    assert.deepEqual(calls[0].args, [
      "link",
      "--project-ref",
      STAGING_PROJECT_REF,
    ]);
  });

  it("15. unknown operation → exit 8", async () => {
    const { result, calls } = await run({
      op: "db-reset-all",
      env: "staging",
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.INVALID_ARGS);
    assert.equal(calls.length, 0);
  });

  it("16. missing env → exit 8", async () => {
    const { result, calls } = await run({
      op: "check-only",
      env: null,
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.INVALID_ARGS);
    assert.equal(calls.length, 0);
  });

  it("17. missing project-ref for remote write op → secure refuse", async () => {
    const { result, calls, output } = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: false,
        raw: [],
      },
      { readProjectRef: () => null }
    );
    assert.equal(result.exitCode, EXIT.UNKNOWN_ENV_OR_REF);
    assert.equal(calls.length, 0);
    assert.doesNotMatch(output, /service_role|password|DATABASE_URL|eyJ/);
  });

  it("18. sensitive values never appear in output", async () => {
    const secret = "super-secret-service-role-key-value";
    const bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadsig";
    const { output, result } = await run(
      {
        op: "link-staging",
        env: "staging",
        confirm: CONFIRM_LINK_STAGING,
        execute: true,
        raw: [],
      },
      {
        readProjectRef: () => null,
        runCommand: async () => ({
          status: 0,
          stdout: `ok password=${secret}`,
          stderr: bearer,
        }),
      }
    );
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(output.includes(secret), false);
    assert.equal(output.includes(bearer), false);
    assert.match(output, /\[REDACTED\]/);
  });

  it("19. production not bypassable by confirmation → always exit 2", async () => {
    for (const confirm of [CONFIRM_DB_PUSH_STAGING, "YES", null]) {
      const { result, calls } = await run(
        {
          op: "db-push-staging",
          env: "production",
          confirm,
          execute: true,
          raw: ["--env=production"],
        },
        { readProjectRef: () => STAGING_PROJECT_REF }
      );
      assert.equal(result.exitCode, EXIT.PRODUCTION);
      assert.equal(calls.length, 0);
    }

    const viaActive = await run(
      {
        op: "db-push-staging",
        env: "staging",
        confirm: CONFIRM_DB_PUSH_STAGING,
        execute: true,
        raw: [],
      },
      { readProjectRef: () => PRODUCTION_PROJECT_REF }
    );
    assert.equal(viaActive.result.exitCode, EXIT.PRODUCTION);
    assert.equal(viaActive.calls.length, 0);
    assert.match(viaActive.output, new RegExp(PRODUCTION_BLOCKED_MESSAGE));
  });

  it("20. check-only local → no remote, PASS when local context valid", async () => {
    const { result, calls, output } = await run({
      op: "check-only",
      env: "local",
      execute: false,
      raw: [],
    });
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(calls.length, 0);
    assert.match(output, /planned_command=\(none\)/);
    assert.match(output, /DRY RUN|decision=PASS/);
  });
});
