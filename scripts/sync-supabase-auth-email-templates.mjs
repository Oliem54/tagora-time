import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, ".env.local");
const TEMPLATE_DIR = path.join(ROOT_DIR, "supabase", "email-templates");
const MANIFEST_PATH = path.join(TEMPLATE_DIR, "manifest.json");

function parseArgs(argv) {
  return argv.reduce(
    (acc, arg) => {
      if (arg === "--dry-run") {
        acc.dryRun = true;
        return acc;
      }

      if (arg.startsWith("--only=")) {
        acc.only = arg
          .slice("--only=".length)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }

      return acc;
    },
    { dryRun: false, only: [] }
  );
}

async function loadEnvFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");

      if (separatorIndex < 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getProjectRef(supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    const [projectRef] = parsed.hostname.split(".");

    if (!projectRef) {
      throw new Error("Missing project ref");
    }

    return projectRef;
  } catch {
    throw new Error(
      `Unable to derive project ref from NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`
    );
  }
}

async function loadManifest() {
  const content = await readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(content);
}

async function buildPayload(manifestEntries) {
  const payload = {};

  for (const entry of manifestEntries) {
    const htmlPath = path.join(TEMPLATE_DIR, entry.htmlFile);
    const html = await readFile(htmlPath, "utf8");

    payload[entry.subjectKey] = entry.subject;
    payload[entry.contentKey] = html;

    if (entry.enabledKey) {
      payload[entry.enabledKey] = true;
    }
  }

  return payload;
}

function filterEntries(entries, only) {
  if (!only.length) {
    return entries;
  }

  const onlySet = new Set(only);
  return entries.filter((entry) => onlySet.has(entry.slug));
}

async function patchAuthConfig(projectRef, accessToken, payload) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase Management API PATCH failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

async function main() {
  const { dryRun, only } = parseArgs(process.argv.slice(2));

  await loadEnvFile(ENV_PATH);

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = getProjectRef(supabaseUrl);
  const manifest = await loadManifest();
  const selectedEntries = filterEntries(manifest, only);

  if (!selectedEntries.length) {
    throw new Error("No templates matched the current selection.");
  }

  const payload = await buildPayload(selectedEntries);

  console.log("[auth-email-templates] ready", {
    projectRef,
    dryRun,
    templates: selectedEntries.map((entry) => entry.slug),
    updatedKeys: Object.keys(payload),
  });

  if (dryRun) {
    console.log(
      "[auth-email-templates] dry-run only. No change was sent to Supabase."
    );
    return;
  }

  const accessToken = requireEnv("SUPABASE_MANAGEMENT_ACCESS_TOKEN");
  await patchAuthConfig(projectRef, accessToken, payload);

  console.log("[auth-email-templates] sync complete", {
    projectRef,
    templates: selectedEntries.map((entry) => entry.slug),
  });
}

main().catch((error) => {
  console.error("[auth-email-templates] failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
