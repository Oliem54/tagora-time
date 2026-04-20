/**
 * Insertion locale d'une position GPS de test dans `gps_positions` (service role).
 * Usage (dans le terminal Cursor, à la racine du repo) :
 *   node scripts/insert-test-gps.mjs <livraison_id> <latitude> <longitude>
 *
 * Prérequis : .env.local avec NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("Fichier .env.local introuvable à la racine du projet.");
    process.exit(1);
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

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local");
  process.exit(1);
}

const livraisonId = Number(process.argv[2]);
const lat = Number(process.argv[3]);
const lng = Number(process.argv[4]);

if (!Number.isFinite(livraisonId) || livraisonId <= 0) {
  console.error("Usage: node scripts/insert-test-gps.mjs <livraison_id> <latitude> <longitude>");
  process.exit(1);
}

if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error("latitude et longitude doivent être des nombres valides.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: liv, error: livErr } = await supabase
  .from("livraisons_planifiees")
  .select("id, company_context")
  .eq("id", livraisonId)
  .maybeSingle();

if (livErr) {
  console.error("Erreur lecture livraison:", livErr.message);
  process.exit(1);
}

if (!liv) {
  console.error(`Aucune livraison avec id=${livraisonId}`);
  process.exit(1);
}

const companyContext = liv.company_context ?? "oliem_solutions";

const { data: row, error: insErr } = await supabase
  .from("gps_positions")
  .insert({
    company_context: companyContext,
    latitude: lat,
    longitude: lng,
    livraison_id: livraisonId,
    speed_kmh: 0,
    gps_status: "actif",
    metadata: { source: "insert-test-gps.mjs" },
  })
  .select("id, recorded_at, latitude, longitude, livraison_id")
  .single();

if (insErr) {
  console.error("Erreur insert gps_positions:", insErr.message);
  process.exit(1);
}

console.log("OK position insérée:", row);
