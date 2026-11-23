import { createPrivateKey, randomBytes, sign } from "node:crypto";

if (process.env.HORORA_DIRECTORY_PROBE !== "1") {
  process.exit(0);
}

const raw = String(process.env.HORORA_DIRECTORY_STAGING_PRIVATE_JWK ?? "").trim();
let jwk = null;
try {
  jwk = JSON.parse(raw);
} catch {
  jwk = null;
}
const usable =
  jwk &&
  jwk.d &&
  jwk.kty === "EC" &&
  jwk.crv === "P-256" &&
  jwk.x &&
  jwk.y &&
  typeof jwk.kid === "string" &&
  jwk.kid.length > 0;
if (!usable) {
  process.stdout.write(`${JSON.stringify({ probe: "KEY_UNUSABLE", length: raw.length })}\n`);
  process.exit(0);
}

function originOf(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const dedicated = originOf(process.env.HORORA_DIRECTORY_NEXUS_ORIGIN);
const consolidated = originOf(process.env.NEXUS_CONSOLIDATED_DIRECTORY_ORIGIN);
if (!dedicated || !consolidated || dedicated !== consolidated) {
  process.stdout.write(
    `${JSON.stringify({
      probe: "ORIGIN_REFUSED",
      dedicated: Boolean(dedicated),
      consolidated: Boolean(consolidated),
      agreed: dedicated === consolidated,
    })}\n`
  );
  process.exit(0);
}

const key = createPrivateKey({ key: jwk, format: "jwk" });
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function assertion(organizationId, jti) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "svc_horora_directory",
    sub: "svc_horora_directory",
    aud: "tagora:time:directory",
    iat: now,
    exp: now + 60,
    jti,
    client_id: "svc_horora_directory",
    tenant_id: "tenant_tagora_internal",
    organization_id: organizationId,
    module_key: "tagora_time",
  };
  const header = { alg: "ES256", typ: "JWT", kid: jwk.kid };
  const signingInput = `${encoded(header)}.${encoded(claims)}`;
  const signature = sign("SHA256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

async function call(organizationId, token) {
  const url = new URL("/api/nexus/service/authorized-module-directory", dedicated);
  url.searchParams.set("tenantId", "tenant_tagora_internal");
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("moduleKey", "tagora_time");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json().catch(() => null);
  const entries = Array.isArray(body?.entries) ? body.entries : [];
  return {
    http: response.status,
    ok: body?.ok === true,
    contract: typeof body?.contract === "string" ? body.contract : null,
    reasonCode: typeof body?.reasonCode === "string" ? body.reasonCode : null,
    complete: body?.complete === true,
    tenantMatch: body?.tenantId === "tenant_tagora_internal",
    organizationMatch: body?.organizationId === organizationId,
    moduleMatch: body?.moduleKey === "tagora_time",
    entryCount: entries.length,
    entries,
  };
}

const firstToken = assertion(
  "org_tagora_internal",
  `horora_dir_${Date.now()}_${randomBytes(8).toString("hex")}`
);
const first = await call("org_tagora_internal", firstToken);
const replay = await call("org_tagora_internal", firstToken);
const foreignToken = assertion(
  "org_foreign_probe",
  `horora_dir_foreign_${Date.now()}_${randomBytes(8).toString("hex")}`
);
const foreign = await call("org_foreign_probe", foreignToken);
let qa = { found: false };
const counts = {};
for (const entry of first.entries) {
  const status = typeof entry?.status === "string" ? entry.status : "UNKNOWN";
  counts[status] = (counts[status] ?? 0) + 1;
  const email =
    typeof entry?.contactEmail === "string" ? entry.contactEmail.trim().toLowerCase() : "";
  if (email === "info@pi-titan.com") {
    qa = {
      found: true,
      nuser:
        typeof entry.userId === "string" && /^nuser_[a-f0-9]{32}$/.test(entry.userId)
          ? entry.userId
          : null,
      status,
      role: typeof entry.nexusRoleKey === "string" ? entry.nexusRoleKey : null,
      employeeRole: entry.nexusRoleKey === "employe",
    };
  }
}
process.stdout.write(
  `${JSON.stringify({
    probe: "DIRECTORY",
    host: new URL(dedicated).host,
    http: first.http,
    ok: first.ok,
    contract: first.contract,
    reasonCode: first.reasonCode,
    complete: first.complete,
    tenantMatch: first.tenantMatch,
    organizationMatch: first.organizationMatch,
    moduleMatch: first.moduleMatch,
    entryCount: first.entryCount,
    counts,
    qa,
    replayHttp: replay.http,
    replayReason: replay.reasonCode,
    foreignHttp: foreign.http,
    foreignReason: foreign.reasonCode,
  })}\n`
);
