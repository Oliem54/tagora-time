/**
 * Machine-side staging handoff E2E (sanitized).
 * Issues TAGORA_HANDOFF_V1 with Nexus staging signing env, posts to HORORA
 * callback, checks dashboard redirect and replay refusal.
 * Never prints tokens, cookies, keys, or PII.
 */
const { createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT } = require("jose");

const NEXUS_ORIGIN = "https://tagora-nexus-staging.vercel.app";
const HORORA_CALLBACK =
  "https://tagora-time-staging.vercel.app/auth/nexus/callback";
const MARTIN_ACTOR = "nuser_3e45dda035be43af16d14eca02bf8a5f";
const ORG = "org_tagora_internal";

function requireEnv(name) {
  const v = process.env[name];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error("missing_env:" + name);
  }
  return v.trim();
}

async function issueFromEnv() {
  const kid = process.env.NEXUS_HANDOFF_ACTIVE_KID;
  const jwkRaw = process.env.NEXUS_HANDOFF_ACTIVE_PRIVATE_JWK;
  const issuer = process.env.NEXUS_HANDOFF_ISSUER || NEXUS_ORIGIN;
  if (!kid || !jwkRaw) {
    return { ok: false, reason: "signing_env_absent" };
  }
  const privateJwk = JSON.parse(jwkRaw);
  const { importJWK } = require("jose");
  const key = await importJWK(privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const jti = "jti_machine_" + now + "_" + Math.random().toString(16).slice(2, 10);
  const nonce = "nonce_machine_" + Math.random().toString(16).slice(2, 10);
  const token = await new SignJWT({
    typ: "TAGORA_HANDOFF_V1",
    handoff_version: "TAGORA_HANDOFF_V1",
    module_key: "tagora_time",
    user_id: MARTIN_ACTOR,
    organization_id: ORG,
    membership_id: "mem_machine_side",
    tenant_id: "tenant_tagora_internal",
    handoff_id: "h_machine_" + now,
    grant_id: "g_machine",
    grant_version: "1",
    entry_role: "NEXUS_ENTRY_OPERATOR",
    jti,
    nonce,
  })
    .setProtectedHeader({ alg: "ES256", kid, typ: "TAGORA_HANDOFF_V1" })
    .setIssuer(issuer)
    .setAudience("tagora:time")
    .setSubject(MARTIN_ACTOR)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 90)
    .sign(key);
  return { ok: true, token, jti };
}

async function postCallback(token) {
  const body = new URLSearchParams({ handoff: token });
  const res = await fetch(HORORA_CALLBACK, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://tagora-time-staging.vercel.app",
    },
    body,
    redirect: "manual",
  });
  const location = res.headers.get("location") || "";
  const setCookie = res.headers.get("set-cookie") || "";
  return {
    status: res.status,
    locationPath: (() => {
      try {
        return new URL(location, HORORA_CALLBACK).pathname;
      } catch {
        return location;
      }
    })(),
    locationReason: (() => {
      try {
        return new URL(location, HORORA_CALLBACK).searchParams.get("reason");
      } catch {
        return null;
      }
    })(),
    hasSessionCookie: /horora_nx_session=/.test(setCookie),
  };
}

async function main() {
  console.log("JWKS_FETCH_BEGIN");
  const jwksRes = await fetch(NEXUS_ORIGIN + "/.well-known/jwks.json");
  console.log("JWKS_HTTP=" + jwksRes.status);

  const issued = await issueFromEnv();
  if (!issued.ok) {
    console.log("ISSUE=" + issued.reason);
    console.log("MACHINE_SIDE_FRESH_HANDOFF=NO");
    process.exitCode = 2;
    return;
  }
  console.log("ISSUE=OK");

  const first = await postCallback(issued.token);
  console.log("FIRST_STATUS=" + first.status);
  console.log("FIRST_PATH=" + first.locationPath);
  console.log("FIRST_REASON=" + (first.locationReason || "none"));
  console.log("SESSION_CREATED=" + (first.hasSessionCookie ? "YES" : "NO"));
  const dashboardOk = ["/admin/dashboard", "/direction/dashboard", "/employe/dashboard"].includes(
    first.locationPath
  );
  console.log("EXPECTED_DASHBOARD_REACHED=" + (dashboardOk ? "YES" : "NO"));

  const replay = await postCallback(issued.token);
  console.log("REPLAY_STATUS=" + replay.status);
  console.log("REPLAY_PATH=" + replay.locationPath);
  console.log("REPLAY_REASON=" + (replay.locationReason || "none"));
  const replayRefused =
    replay.locationPath === "/auth/nexus/denied" &&
    (replay.locationReason === "replay" || replay.locationReason === "handoff_refused");
  console.log("REPLAY_REFUSED=" + (replayRefused ? "YES" : "NO"));

  const pass = dashboardOk && first.hasSessionCookie && replayRefused;
  console.log("MACHINE_SIDE_FRESH_HANDOFF=" + (pass ? "PASS" : "FAIL"));
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
  console.log("MACHINE_SIDE_ERROR=" + (e && e.message ? e.message.split(":")[0] : "unknown"));
  process.exitCode = 1;
});
