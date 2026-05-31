/**
 * Diagnostic local lecture seule. Ne pas exécuter sans validation. Ne jamais committer de secrets.
 *
 * Vérifie la logique GPS horodateur / sorties terrain contre la base PAB en production.
 * Lecture seule : SELECT sur gps_bases uniquement, puis calcul local (aucune écriture DB).
 *
 * Usage (après validation explicite) :
 *   GPS_DIAGNOSTIC_CONFIRM_READONLY=YES node --env-file=.env.local scripts/_gps-prod-format-check.mjs
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (process.env.GPS_DIAGNOSTIC_CONFIRM_READONLY !== "YES") {
  console.error(
    "Refus d'exécution : GPS_DIAGNOSTIC_CONFIRM_READONLY=YES requis pour ce diagnostic lecture seule."
  );
  process.exit(1);
}

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Variables d'environnement manquantes : NEXT_PUBLIC_SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: pab } = await supabase
  .from("gps_bases")
  .select("nom, latitude, longitude, adresse, company_context, rayon_m")
  .eq("nom", "PAB")
  .limit(1)
  .maybeSingle();

if (!pab) {
  console.error("PAB not found");
  process.exit(1);
}

const { evaluateEmployeeWebPunchGps, formatHorodateurGpsJournalSuffix } =
  await import("../src/app/lib/horodateur-gps-punch.server.ts");

const latIn = Number(pab.latitude);
const lngIn = Number(pab.longitude);

const inZone = await evaluateEmployeeWebPunchGps({
  latitude: latIn,
  longitude: lngIn,
  companyContext: pab.company_context,
  punchGpsMode: "retroactive_request",
});

const outZone = await evaluateEmployeeWebPunchGps({
  latitude: 45.5,
  longitude: -73.5,
  companyContext: pab.company_context,
  punchGpsMode: "retroactive_request",
});

const report = {
  logicInZone: inZone.ok ? inZone.zoneValidated : null,
  logicOutZone: outZone.ok ? outZone.zoneValidated : null,
  formatInZone: null,
  formatOutZone: null,
};

if (inZone.ok) {
  report.formatInZone = formatHorodateurGpsJournalSuffix({
    latitude: inZone.latitude,
    longitude: inZone.longitude,
    zoneValidated: inZone.zoneValidated,
    matchedBaseName: inZone.matchedBaseName,
    matchedBaseAddress: inZone.matchedBaseAddress,
    requestedAtIso: "2026-05-24T18:30:00.000Z",
  });
}

if (outZone.ok) {
  report.formatOutZone = formatHorodateurGpsJournalSuffix({
    latitude: outZone.latitude,
    longitude: outZone.longitude,
    zoneValidated: outZone.zoneValidated,
    matchedBaseName: outZone.matchedBaseName,
    matchedBaseAddress: outZone.matchedBaseAddress,
  });
}

console.log("GPS_PROD_FORMAT_CHECK", JSON.stringify(report, null, 2));
