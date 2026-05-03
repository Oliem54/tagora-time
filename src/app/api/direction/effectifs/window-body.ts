import type { EffectifsDepartmentKey } from "@/app/lib/effectifs-payload.shared";
import { isEffectifsDepartmentKey } from "@/app/lib/effectifs-departments.shared";

export function normalizeTimeInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return null;
}

export function parseDepartmentKey(value: unknown): EffectifsDepartmentKey | null {
  if (typeof value !== "string") return null;
  const k = value.trim();
  return isEffectifsDepartmentKey(k) ? k : null;
}

export function parseWeekday(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 6) return null;
  return n;
}

export function parseMinEmployees(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function parseActive(value: unknown, fallback: boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

export type ParsedWindowInsert = {
  company_key: "all" | "oliem_solutions" | "titan_produits_industriels";
  department_key: EffectifsDepartmentKey;
  location_key: string;
  location_label: string;
  weekday: number;
  start_local: string;
  end_local: string;
  min_employees: number;
  active: boolean;
};

function parseCompanyKey(value: unknown): "all" | "oliem_solutions" | "titan_produits_industriels" {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "all";
  if (v === "oliem" || v === "oliem_solutions") return "oliem_solutions";
  if (v === "titan" || v === "titan_produits_industriels") return "titan_produits_industriels";
  return "all";
}

export function parseWindowInsertBody(body: unknown):
  | { ok: true; value: ParsedWindowInsert }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const b = body as Record<string, unknown>;

  const departmentKey = parseDepartmentKey(
    b.department_key ?? b.department
  );
  if (!departmentKey) {
    return { ok: false, error: "Département invalide." };
  }

  const weekday = parseWeekday(b.weekday ?? b.day_of_week);
  if (weekday === null) {
    return { ok: false, error: "Jour (0–6, lundi=0) invalide." };
  }

  const startLocal = normalizeTimeInput(b.start_local ?? b.start_time);
  const endLocal = normalizeTimeInput(b.end_local ?? b.end_time);
  if (!startLocal || !endLocal) {
    return { ok: false, error: "Heure début ou fin invalide (HH:MM)." };
  }

  const ws = toMin(startLocal);
  const we = toMin(endLocal);
  if (we <= ws) {
    return { ok: false, error: "L’heure de fin doit être après le début." };
  }

  const minEmployees = parseMinEmployees(b.min_employees ?? b.min_staff);
  if (minEmployees === null) {
    return { ok: false, error: "Nombre de personnes requises invalide (entier ≥ 0)." };
  }

  const locKey =
    typeof b.location_key === "string" && b.location_key.trim()
      ? b.location_key.trim()
      : typeof b.location === "string" && b.location.trim()
        ? b.location.trim()
        : "principal";

  const locLabel =
    typeof b.location_label === "string" ? b.location_label.trim() : "";

  return {
    ok: true,
    value: {
      company_key: parseCompanyKey(b.company_key),
      department_key: departmentKey,
      location_key: locKey,
      location_label: locLabel,
      weekday,
      start_local: startLocal,
      end_local: endLocal,
      min_employees: minEmployees,
      active: parseActive(b.active, true),
    },
  };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

export function parseWindowPatchBody(body: unknown):
  | { ok: true; value: Partial<ParsedWindowInsert> & { id?: never } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corps JSON invalide." };
  }
  const b = body as Record<string, unknown>;
  const out: Partial<ParsedWindowInsert> = {};

  if ("department_key" in b || "department" in b) {
    const dk = parseDepartmentKey(b.department_key ?? b.department);
    if (!dk) return { ok: false, error: "Département invalide." };
    out.department_key = dk;
  }

  if ("company_key" in b) {
    out.company_key = parseCompanyKey(b.company_key);
  }

  if ("weekday" in b || "day_of_week" in b) {
    const w = parseWeekday(b.weekday ?? b.day_of_week);
    if (w === null) return { ok: false, error: "Jour invalide." };
    out.weekday = w;
  }

  if ("start_local" in b || "start_time" in b) {
    const t = normalizeTimeInput(b.start_local ?? b.start_time);
    if (!t) return { ok: false, error: "Heure début invalide." };
    out.start_local = t;
  }

  if ("end_local" in b || "end_time" in b) {
    const t = normalizeTimeInput(b.end_local ?? b.end_time);
    if (!t) return { ok: false, error: "Heure fin invalide." };
    out.end_local = t;
  }

  if ("min_employees" in b || "min_staff" in b) {
    const m = parseMinEmployees(b.min_employees ?? b.min_staff);
    if (m === null) return { ok: false, error: "Nombre requis invalide." };
    out.min_employees = m;
  }

  if ("location_key" in b || "location" in b) {
    const lk = b.location_key ?? b.location;
    if (typeof lk !== "string" || !lk.trim()) {
      return { ok: false, error: "Emplacement (clé) invalide." };
    }
    out.location_key = lk.trim();
  }

  if ("location_label" in b) {
    out.location_label =
      typeof b.location_label === "string" ? b.location_label.trim() : "";
  }

  if ("active" in b) {
    if (b.active !== true && b.active !== false) {
      return { ok: false, error: "Actif doit être true ou false." };
    }
    out.active = b.active;
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "Aucun champ à mettre à jour." };
  }

  if (
    out.start_local !== undefined &&
    out.end_local !== undefined &&
    toMin(out.end_local) <= toMin(out.start_local)
  ) {
    return { ok: false, error: "L’heure de fin doit être après le début." };
  }

  return { ok: true, value: out };
}
