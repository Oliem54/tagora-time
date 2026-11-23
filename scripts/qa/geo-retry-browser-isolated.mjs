/**
 * Local browser QA for punch GPS retry (commit 2b534003+).
 * Exercises the real client module in Chromium with mocked geolocation.
 * Blocks write/punch network calls. Does NOT authenticate Preview/Staging.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const clientSrc = path.join(
  repoRoot,
  "src/app/lib/employee-punch-geolocation.client.ts"
);
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "horora-geo-retry-browser-qa-"));
const bundlePath = path.join(outDir, "employee-punch-geolocation.client.js");
const htmlPath = path.join(outDir, "index.html");

const EXPECTED_LAT = 45.5017;
const EXPECTED_LNG = -73.5673;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    // Prefer argv arrays without shell so flags like --outfile stay intact on Windows.
    shell: opts.shell ?? false,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function bundleClient() {
  ensureDir(outDir);
  if (!fs.existsSync(clientSrc)) {
    throw new Error(`Missing client source: ${clientSrc}`);
  }
  const srcText = fs.readFileSync(clientSrc, "utf8");
  if (!srcText.includes('result.code === "position_unavailable"')) {
    throw new Error(
      "Client source missing position_unavailable retry — wrong commit/worktree"
    );
  }

  run(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      clientSrc,
      "--bundle",
      "--format=esm",
      "--platform=browser",
      `--outfile=${bundlePath}`,
      "--log-level=error",
    ],
    { shell: true }
  );
  if (!fs.existsSync(bundlePath) || fs.statSync(bundlePath).size < 100) {
    throw new Error(`esbuild produced empty bundle at ${bundlePath}`);
  }

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>HORORA geo retry browser QA (local isolated)</title>
  </head>
  <body>
    <h1>HORORA geo retry browser QA</h1>
    <p>Local only. No punch writes.</p>
    <script type="module">
      import {
        clearEmployeePunchGeolocationCache,
        readEmployeePunchGeolocation,
      } from "./employee-punch-geolocation.client.js";
      window.__HORORA_GEO_QA__ = {
        clearEmployeePunchGeolocationCache,
        readEmployeePunchGeolocation,
      };
      window.__HORORA_GEO_QA_READY__ = true;
    </script>
  </body>
</html>
`;
  fs.writeFileSync(htmlPath, html, "utf8");
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "writes_blocked_by_geo_qa" }));
      return;
    }
    // Block punch API shapes only — do not match local filenames like
    // employee-punch-geolocation.client.js
    if (/\/api\/horodateur\/punch\b/i.test(urlPath)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "punch_blocked_by_geo_qa" }));
      return;
    }

    let filePath = path.join(outDir, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === ".js"
        ? "text/javascript; charset=utf-8"
        : ext === ".html"
          ? "text/html; charset=utf-8"
          : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(fs.readFileSync(filePath));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function loadPlaywright() {
  const require = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
  try {
    return require("playwright");
  } catch {
    // Install into a temp prefix so the repo package.json/lockfile stay untouched.
    const pwPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "horora-playwright-prefix-"));
    run(
      "npm",
      [
        "install",
        "--prefix",
        pwPrefix,
        "--no-fund",
        "--no-audit",
        "playwright@1.51.1",
      ],
      { shell: true }
    );
    const pwRequire = createRequire(path.join(pwPrefix, "package.json"));
    return pwRequire("playwright");
  }
}

async function main() {
  bundleClient();
  const { chromium } = await loadPlaywright();
  run("npx", ["--yes", "playwright@1.51.1", "install", "chromium"], {
    shell: true,
  });

  const { server, origin } = await startStaticServer();
  /** @type {import('playwright').Browser | null} */
  let browser = null;
  const blockedWrites = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Block writes/punch without intercepting local ESM module loads.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const method = request.method().toUpperCase();
      const url = request.url();
      if (url.startsWith(origin)) {
        await route.continue();
        return;
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) || /punch/i.test(url)) {
        blockedWrites.push({ method, url, reason: "blocked_non_local" });
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ error: "writes_blocked_by_geo_qa" }),
        });
        return;
      }
      await route.abort();
    });

    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => window.__HORORA_GEO_QA_READY__ === true, null, {
        timeout: 15000,
      });
    } catch (error) {
      throw new Error(
        `Harness module failed to become ready: ${String(error)}; pageErrors=${JSON.stringify(pageErrors)}; consoleErrors=${JSON.stringify(consoleErrors)}; bundleBytes=${fs.statSync(bundlePath).size}`
      );
    }

    const outcome = await page.evaluate(
      async ({ lat, lng }) => {
        const api = window.__HORORA_GEO_QA__;
        api.clearEmployeePunchGeolocationCache();

        const calls = [];
        navigator.geolocation.getCurrentPosition = (success, error, options = {}) => {
          calls.push({
            enableHighAccuracy: Boolean(options.enableHighAccuracy),
            timeout: options.timeout ?? null,
          });
          if (options.enableHighAccuracy) {
            error?.({
              code: 2,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
              message: "Position unavailable",
            });
            return;
          }
          success?.({
            coords: {
              latitude: lat,
              longitude: lng,
              accuracy: 40,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON() {
                return this;
              },
            },
            timestamp: Date.now(),
            toJSON() {
              return this;
            },
          });
        };

        const result = await api.readEmployeePunchGeolocation({ skipCache: true });
        return { result, calls };
      },
      { lat: EXPECTED_LAT, lng: EXPECTED_LNG }
    );

    const { result, calls } = outcome;
    const first = calls[0] || null;
    const second = calls[1] || null;
    const pass =
      result?.ok === true &&
      result.attempts === 2 &&
      Math.abs(result.latitude - EXPECTED_LAT) < 1e-9 &&
      Math.abs(result.longitude - EXPECTED_LNG) < 1e-9 &&
      first?.enableHighAccuracy === true &&
      second?.enableHighAccuracy === false &&
      calls.length >= 2;

    const report = {
      BROWSER_TEST: pass ? "PASS" : "HOLD",
      REAL_CLIENT_CODE_EXECUTED: true,
      FIRST_GEO_ATTEMPT: first
        ? `high_accuracy=${first.enableHighAccuracy}; simulated=position_unavailable`
        : "MISSING",
      SECOND_GEO_ATTEMPT: second
        ? `high_accuracy=${second.enableHighAccuracy}; simulated=coords_ok`
        : "MISSING",
      COORDINATES_RECOVERED: Boolean(result?.ok),
      RESULT: result,
      CALLS: calls,
      PUNCH_POST_SENT: false,
      BLOCKED_WRITES: blockedWrites,
      HARNESS_ORIGIN: origin,
      CLIENT_SOURCE: clientSrc,
    };

    console.log(JSON.stringify(report, null, 2));
    if (!pass) {
      process.exitCode = 2;
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        BROWSER_TEST: "HOLD",
        REAL_CLIENT_CODE_EXECUTED: false,
        ERROR: String(error && error.stack ? error.stack : error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
