"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";
import InternalMentionsPanel from "@/app/components/internal/InternalMentionsPanel";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { getOperationCoordinates } from "@/app/lib/livraisons/coordinates";

const DayOperationsMap = dynamic(() => import("./DayOperationsMap"), { ssr: false });

type Row = Record<string, string | number | null | undefined>;
type GeocodedPoint = {
  latitude: number;
  longitude: number;
  confidence: "exact" | "approximatif";
};
type OriginBase = { label: string; latitude: number; longitude: number };
type StopEditForm = {
  adresse: string;
  ville: string;
  code_postal: string;
  province: string;
  date_livraison: string;
  heure_prevue: string;
  statut: string;
  latitude: string;
  longitude: string;
  note_chauffeur: string;
  commentaire_operationnel: string;
};

type Props = {
  area: "direction" | "employe";
};

type SuggestedStop = {
  id: string;
  ordre: number;
  nom: string;
  type: "livraison" | "ramassage";
  adresse: string;
  lat: number;
  lng: number;
  distanceDepuisPrecedentKm: number;
  tempsConduiteDepuisPrecedentMinutes: number;
  tempsServiceMinutes: number;
  arriveeEstimee: string;
  departEstime: string;
};

type RouteSuggestionMetrics = {
  ordreSuggere: SuggestedStop[];
  distanceRoutiereTotaleKm: number;
  tempsConduiteTotalMinutes: number;
  tempsServiceTotalMinutes: number;
  tempsJourneeTotalMinutes: number;
  retourEstime: string;
  orderIds: string[];
  routeGeometryLatLng: Array<[number, number]>;
};

type RouteSuggestionResponse = {
  warnings?: {
    stopsSansCoordonnees?: Array<{ id: string; nom: string; adresse: string }>;
  };
  current: RouteSuggestionMetrics;
  suggested: RouteSuggestionMetrics;
};

function formatDateLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAuditTimestamp(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(raw: string | null | undefined) {
  const value = (raw || "").trim().toLowerCase();
  if (value === "en_cours") return "en_cours" as const;
  if (value === "livree" || value === "ramassee" || value === "ramasse") return "terminee" as const;
  if (value === "pret_a_ramasser") return "prioritaire" as const;
  return "planifiee" as const;
}

function statusLabel(status: ReturnType<typeof normalizeStatus>, type: "livraison" | "ramassage") {
  if (status === "en_cours") return "En cours";
  if (status === "terminee") return type === "ramassage" ? "Ramasse" : "Livree";
  if (status === "prioritaire") return "Prioritaire";
  return "Planifie";
}

function statusTone(status: ReturnType<typeof normalizeStatus>) {
  if (status === "en_cours") return "warning" as const;
  if (status === "terminee") return "success" as const;
  return "default" as const;
}

function getFieldString(row: Row | undefined, keys: string[]) {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getFieldStringPreferPrimary(row: Row | undefined, keys: string[]) {
  if (!row) return { value: "", hasExplicitField: false };
  let hasExplicitField = false;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      hasExplicitField = true;
      const value = row[key];
      if (typeof value === "string") {
        return { value: value.trim(), hasExplicitField };
      }
      return { value: "", hasExplicitField };
    }
  }
  return { value: "", hasExplicitField };
}

function buildFullAddress(operationRow: Row, dossierRow?: Row) {
  const streetPrimary = getFieldStringPreferPrimary(operationRow, ["adresse", "address", "rue"]);
  const cityPrimary = getFieldStringPreferPrimary(operationRow, ["ville", "city", "municipalite"]);
  const postalPrimary = getFieldStringPreferPrimary(operationRow, [
    "code_postal",
    "postal_code",
    "zip",
    "zipcode",
  ]);
  const provincePrimary = getFieldStringPreferPrimary(operationRow, ["province", "etat", "state"]);

  const street = streetPrimary.hasExplicitField
    ? streetPrimary.value
    : getFieldString(dossierRow, ["adresse", "address", "rue"]);
  const city = cityPrimary.hasExplicitField
    ? cityPrimary.value
    : getFieldString(dossierRow, ["ville", "city", "municipalite"]);
  const postal = postalPrimary.hasExplicitField
    ? postalPrimary.value
    : getFieldString(dossierRow, ["code_postal", "postal_code", "zip", "zipcode"]);
  const province = provincePrimary.hasExplicitField
    ? provincePrimary.value
    : getFieldString(dossierRow, ["province", "etat", "state"]);
  const country =
    getFieldString(operationRow, ["pays", "country"]) ||
    getFieldString(dossierRow, ["pays", "country"]) ||
    "Canada";

  const parts = [street, city, postal, province, country].filter(Boolean);
  const full = parts.join(", ");
  const isReliable = Boolean(street && city && postal);
  return { street, city, postal, province, country, full, isReliable };
}

function hasReliableManualAddress(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 3;
}

function parseNumericOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGeocodeFallbackQuery(stop: { address: string; row: Row }, dossier?: Row) {
  const addressData = buildFullAddress(stop.row, dossier);
  if (addressData.full.trim()) return addressData.full;
  const parts = [
    stop.address.trim(),
    getFieldString(stop.row, ["ville", "city", "municipalite"]),
    getFieldString(stop.row, ["code_postal", "postal_code", "zip"]),
    getFieldString(stop.row, ["province", "etat", "state"]),
    addressData.country || "Canada",
  ].filter(Boolean);
  return parts.join(", ");
}

function buildGeocodeCandidates(stop: { address: string; row: Row }, dossier?: Row) {
  const addressData = buildFullAddress(stop.row, dossier);
  const base = normalizeAddressInput(addressData.full || "");
  const street = normalizeAddressInput(addressData.street || stop.address || "");
  const city = normalizeAddressInput(addressData.city || "");
  const postal = normalizeAddressInput(addressData.postal || "");
  const province = normalizeAddressInput(addressData.province || "Quebec");
  const streetWithoutNumber = street.replace(/^\d+\s*/, "").trim();
  const hasStreetNumber = /^\d+\s/.test(street);

  const primaryVariants = [
    base,
    [street, city, province, "Canada"].filter(Boolean).join(", "),
    [streetWithoutNumber, city, province].filter(Boolean).join(", "),
    [streetWithoutNumber, city, "Canada"].filter(Boolean).join(", "),
    hasStreetNumber ? [street, city].filter(Boolean).join(", ") : "",
    [city, postal].filter(Boolean).join(", "),
    [city, province, "Canada"].filter(Boolean).join(", "),
    buildGeocodeFallbackQuery(stop, dossier),
  ];
  const accentlessVariants = primaryVariants.map((variant) => stripAccents(variant));

  return dedupeQueries([
    ...primaryVariants,
    [street, city, postal, province, "Canada"].filter(Boolean).join(", "),
    [postal, city, province, "Canada"].filter(Boolean).join(", "),
    ...accentlessVariants,
  ]);
}

function buildGeocodeCandidatesFromParts(parts: {
  adresse: string;
  ville: string;
  code_postal: string;
  province: string;
}) {
  const street = normalizeAddressInput(parts.adresse || "");
  const city = normalizeAddressInput(parts.ville || "");
  const postal = normalizeAddressInput(parts.code_postal || "");
  const province = normalizeAddressInput(parts.province || "Quebec");
  const streetWithoutNumber = street.replace(/^\d+\s*/, "").trim();
  const hasStreetNumber = /^\d+\s/.test(street);
  const full = [street, city, postal, province, "Canada"].filter(Boolean).join(", ");
  const variants = [
    full,
    [street, city, province, "Canada"].filter(Boolean).join(", "),
    [streetWithoutNumber, city, province].filter(Boolean).join(", "),
    [streetWithoutNumber, city, "Canada"].filter(Boolean).join(", "),
    hasStreetNumber ? [street, city].filter(Boolean).join(", ") : "",
    [city, postal].filter(Boolean).join(", "),
    [city, province, "Canada"].filter(Boolean).join(", "),
  ];
  return dedupeQueries([...variants, ...variants.map((value) => stripAccents(value))]);
}

function isReliableAddressParts(street: string, city: string, postal: string) {
  return Boolean(street.trim() && city.trim() && postal.trim());
}

function formatApiErrorDetails(data: unknown, payload: Record<string, unknown>) {
  const root = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const error = (root.error && typeof root.error === "object" ? root.error : {}) as Record<
    string,
    unknown
  >;
  const fallback = (
    root.fallback_error && typeof root.fallback_error === "object" ? root.fallback_error : {}
  ) as Record<string, unknown>;

  const base = [
    `message: ${String(error.message ?? root.message ?? "Erreur inconnue")}`,
    `code: ${String(error.code ?? "-")}`,
    `details: ${String(error.details ?? "-")}`,
    `hint: ${String(error.hint ?? "-")}`,
    `payload: ${JSON.stringify(error.payload ?? payload)}`,
  ];

  if (Object.keys(fallback).length > 0) {
    base.push(
      `fallback_message: ${String(fallback.message ?? "-")}`,
      `fallback_code: ${String(fallback.code ?? "-")}`,
      `fallback_details: ${String(fallback.details ?? "-")}`,
      `fallback_hint: ${String(fallback.hint ?? "-")}`,
      `fallback_payload: ${JSON.stringify(fallback.payload ?? {})}`
    );
  }

  return base.join("\n");
}

const NOMINATIM_MIN_INTERVAL_MS = 1100;

function normalizeAddressInput(value: string) {
  return value
    .replace(/\s*-\s*/g, "-")
    .replace(/\bQC\b/gi, "Quebec")
    .replace(/\bQuebec\b/gi, "Quebec")
    .replace(/\bCAN\b/gi, "Canada")
    .replace(/\bch\.\b/gi, "chemin")
    .replace(/\bboul\.\b/gi, "boulevard")
    .replace(/\bav\.\b/gi, "avenue")
    .replace(/\brte\b/gi, "route")
    .replace(/\bpointes-aux-bleuets\b/gi, "Pointe-aux-Bleuets")
    .replace(/\brue de la pointes\b/gi, "rue de la Pointe")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dedupeQueries(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeAddressInput(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** Geocodage via API serveur (User-Agent, pas de blocage CORS navigateur / Nominatim). */
async function geocodeAddress(address: string): Promise<GeocodedPoint | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const response = await fetch(
      `/api/geocode?q=${encodeURIComponent(query)}`,
      { cache: "no-store", credentials: "same-origin" }
    );
    const data = (await response.json()) as {
      ok?: boolean;
      latitude?: number;
      longitude?: number;
      confidence?: "exact" | "approximatif" | "faible";
      error?: string;
    };
    if (!response.ok || !data.ok || data.latitude == null || data.longitude == null) {
      return null;
    }
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      confidence: data.confidence === "exact" ? "exact" : "approximatif",
    };
  } catch {
    return null;
  }
}

export default function DayOperationsView({ area }: Props) {
  const searchParams = useSearchParams();
  const { user, role, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<Row[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Row[]>([]);
  const [dossiersById, setDossiersById] = useState<Map<number, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [geoById, setGeoById] = useState<Record<number, GeocodedPoint>>({});
  const [origin, setOrigin] = useState<OriginBase | null>(null);
  const [originAddressInput, setOriginAddressInput] = useState("");
  const [originUpdating, setOriginUpdating] = useState(false);
  const [returnOrigin, setReturnOrigin] = useState<OriginBase | null>(null);
  const [returnAddressInput, setReturnAddressInput] = useState("");
  const [returnUpdating, setReturnUpdating] = useState(false);
  const [routeApplying, setRouteApplying] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeSuggestion, setRouteSuggestion] = useState<RouteSuggestionResponse | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [orderedStopIds, setOrderedStopIds] = useState<number[]>([]);
  const [isEditingStop, setIsEditingStop] = useState(false);
  const [savingStop, setSavingStop] = useState(false);
  const [stopFormMessage, setStopFormMessage] = useState("");
  const [recheckingStopId, setRecheckingStopId] = useState<number | null>(null);
  const [searchingPosition, setSearchingPosition] = useState(false);
  const routeSuggestionTimerRef = useRef<number | null>(null);
  const lastRoutePayloadKeyRef = useRef<string>("");
  const [manualPickStopId, setManualPickStopId] = useState<number | null>(null);
  const [manualPositionDraft, setManualPositionDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [quickActionLoading, setQuickActionLoading] = useState<string | null>(null);
  const [stopEditForm, setStopEditForm] = useState<StopEditForm>({
    adresse: "",
    ville: "",
    code_postal: "",
    province: "",
    date_livraison: "",
    heure_prevue: "",
    statut: "",
    latitude: "",
    longitude: "",
    note_chauffeur: "",
    commentaire_operationnel: "",
  });
  const [geocodeFailureById, setGeocodeFailureById] = useState<
    Record<number, { message: string; addressTried: string; originalAddress: string }>
  >({});
  const [geocodeStatusById, setGeocodeStatusById] = useState<
    Record<number, "exact" | "approximatif" | "a_valider" | "manuelle">
  >({});

  const dateIso = searchParams.get("date") || "";
  const canUseLivraisons = hasPermission("livraisons");
  const canManageOrder = area === "direction" && (role === "direction" || role === "admin");
  const canEditStopDetails = role === "direction" || role === "admin";
  const isAdmin = role === "admin";

  const persistGeocodedToServer = useCallback(async (stopId: number, latitude: number, longitude: number) => {
    const res = await fetch(`/api/livraisons/${stopId}/geocode-position`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ latitude, longitude }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: Row;
    };
    if (!data.success) return false;
    setGeocodeFailureById((prev) => {
      if (!(stopId in prev)) return prev;
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
    setRows((current) =>
      current.map((row) =>
        Number(row.id) === stopId
          ? { ...row, latitude, longitude, ...(data.data ?? {}) }
          : row
      )
    );
    return true;
  }, []);

  useEffect(() => {
    async function loadDayRows() {
      if (!user || !canUseLivraisons || !dateIso) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: originData } = await supabase
        .from("gps_bases")
        .select("nom, latitude, longitude, company_context, compagnie, type_base")
        .or("nom.ilike.%oliem%,type_base.eq.bureau,type_base.eq.siege")
        .limit(1)
        .maybeSingle();
      if (originData?.latitude && originData?.longitude) {
        const nextOrigin = {
          label: String(originData.nom || "Oliem Solutions"),
          latitude: Number(originData.latitude),
          longitude: Number(originData.longitude),
        };
        setOrigin(nextOrigin);
        setReturnOrigin(nextOrigin);
        setOriginAddressInput(nextOrigin.label);
        setReturnAddressInput(nextOrigin.label);
      } else {
        const fallback = await geocodeAddress("Oliem Solutions, Quebec");
        if (fallback) {
          const nextOrigin = { label: "Oliem Solutions", ...fallback };
          setOrigin(nextOrigin);
          setReturnOrigin(nextOrigin);
          setOriginAddressInput("Oliem Solutions, Quebec");
          setReturnAddressInput("Oliem Solutions, Quebec");
        }
      }
      const [opsRes, chauffeursRes] = await Promise.all([
        supabase
          .from("livraisons_planifiees")
          .select("*")
          .eq("date_livraison", dateIso)
          .order("ordre_arret", { ascending: true })
          .order("heure_prevue", { ascending: true })
          .order("id", { ascending: true }),
        supabase.from("chauffeurs").select("id, nom, prenom, nom_complet, courriel, actif").order("id", { ascending: true }),
      ]);
      const { data, error } = opsRes;
      if (!chauffeursRes.error) {
        setChauffeurs((chauffeursRes.data ?? []) as Row[]);
      } else {
        setChauffeurs([]);
      }
      if (error) {
        setRows([]);
      } else {
        const nextRows = (data ?? []) as Row[];
        setRows(nextRows);
        const dossierIds = Array.from(
          new Set(
            nextRows
              .map((row) => Number(row.dossier_id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
        );
        if (dossierIds.length > 0) {
          const dossiersRes = await supabase.from("dossiers").select("*").in("id", dossierIds);
          if (!dossiersRes.error) {
            const map = new Map<number, Row>();
            ((dossiersRes.data ?? []) as Row[]).forEach((row) => {
              const id = Number(row.id);
              if (Number.isFinite(id)) map.set(id, row);
            });
            setDossiersById(map);
          } else {
            setDossiersById(new Map());
          }
        } else {
          setDossiersById(new Map());
        }
        const firstId = Number((data ?? [])[0]?.id);
        if (Number.isFinite(firstId)) setSelectedId(firstId);
      }
      setLoading(false);
    }

    if (accessLoading) return;
    void loadDayRows();
  }, [accessLoading, canUseLivraisons, dateIso, user]);

  async function updateOriginFromAddress() {
    const query = originAddressInput.trim();
    if (!query) {
      setRouteMessage("Saisis une adresse de point de depart.");
      return;
    }
    if (!hasReliableManualAddress(query)) {
      setRouteMessage("Adresse incomplete pour geocodage fiable.");
      return;
    }
    setOriginUpdating(true);
    const point = await geocodeAddress(query);
    setOriginUpdating(false);
    if (!point) {
      setRouteMessage("Adresse de point de depart introuvable.");
      return;
    }
    setOrigin({
      label: query,
      latitude: point.latitude,
      longitude: point.longitude,
    });
    setRouteMessage("Point de depart mis a jour.");
  }

  async function updateReturnFromAddress() {
    const query = returnAddressInput.trim();
    if (!query) {
      setRouteMessage("Saisis une adresse de point de retour.");
      return;
    }
    if (!hasReliableManualAddress(query)) {
      setRouteMessage("Adresse incomplete pour geocodage fiable.");
      return;
    }
    setReturnUpdating(true);
    const point = await geocodeAddress(query);
    setReturnUpdating(false);
    if (!point) {
      setRouteMessage("Adresse de point de retour introuvable.");
      return;
    }
    setReturnOrigin({
      label: query,
      latitude: point.latitude,
      longitude: point.longitude,
    });
    setRouteMessage("Point de retour mis a jour.");
  }

  const stops = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((item, index) => {
      const id = Number(item.id);
      const type =
        String(item.type_operation || "") === "ramassage_client"
          ? ("ramassage" as const)
          : ("livraison" as const);
      const status = normalizeStatus(String(item.statut || ""));
      const isOverdue = String(item.date_livraison || "") < today && status !== "terminee";
      const dossierId = item.dossier_id ? Number(item.dossier_id) : null;
      const dossier = dossierId != null ? dossiersById.get(dossierId) : undefined;
      const addressData = buildFullAddress(item, dossier);
      return {
        id,
        order: Number(item.ordre_arret) || index + 1,
        type,
        client: String(item.client || `Arret #${id}`),
        address: addressData.street || String(item.adresse || ""),
        fullAddress: addressData.full,
        hasReliableAddress: addressData.isReliable,
        time: String(item.heure_prevue || "-"),
        status,
        statusText: statusLabel(status, type),
        statusTone: statusTone(status),
        isOverdue,
        dossierId,
        row: item,
      };
    });
  }, [dossiersById, rows]);

  useEffect(() => {
    const ids = stops
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stop) => stop.id);
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrderedStopIds([]);
      return;
    }
    setOrderedStopIds((current) => {
      if (current.length === ids.length && current.every((id, index) => id === ids[index])) {
        return current;
      }
      return ids;
    });
  }, [stops]);

  useEffect(() => {
    async function geocodeStops() {
      if (stops.length === 0) {
        setGeocodeFailureById({});
        return;
      }
      const nextGeo: Record<number, GeocodedPoint> = {};
      const failures: Record<number, { message: string; addressTried: string; originalAddress: string }> = {};
      const statuses: Record<number, "exact" | "approximatif" | "a_valider"> = {};
      let changed = false;
      let lastOpWasNominatim = false;

      for (const stop of stops) {
        if (!Number.isFinite(stop.id)) continue;
        const coords = getOperationCoordinates(stop.row);
        if (coords.lat != null && coords.lng != null) {
          lastOpWasNominatim = false;
          nextGeo[stop.id] = { latitude: coords.lat, longitude: coords.lng, confidence: "exact" };
          statuses[stop.id] = "exact";
          changed = true;
          continue;
        }
        const dossier = stop.dossierId != null ? dossiersById.get(stop.dossierId) : undefined;
        const queries = buildGeocodeCandidates({ address: stop.address, row: stop.row }, dossier);
        if (queries.length === 0) {
          failures[stop.id] = {
            message:
              "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte.",
            addressTried: stop.fullAddress || stop.address || "-",
            originalAddress: stop.fullAddress || stop.address || "-",
          };
          statuses[stop.id] = "a_valider";
          continue;
        }
        let point: GeocodedPoint | null = null;
        let usedQuery = "";
        for (let index = 0; index < queries.length; index += 1) {
          if (lastOpWasNominatim || index > 0) {
            await new Promise((r) => setTimeout(r, NOMINATIM_MIN_INTERVAL_MS));
          }
          const query = queries[index];
          usedQuery = query;
          point = await geocodeAddress(query);
          lastOpWasNominatim = true;
          if (point) break;
        }
        if (point) {
          nextGeo[stop.id] = point;
          statuses[stop.id] = point.confidence === "exact" ? "exact" : "approximatif";
          changed = true;
          if (canEditStopDetails) {
            await persistGeocodedToServer(stop.id, point.latitude, point.longitude);
          }
        } else {
          failures[stop.id] = {
            message:
              "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte.",
            addressTried: usedQuery || stop.fullAddress || stop.address || "-",
            originalAddress: stop.fullAddress || stop.address || "-",
          };
          statuses[stop.id] = "a_valider";
        }
      }
      if (changed) {
        setGeoById((current) => ({ ...current, ...nextGeo }));
      }
      setGeocodeFailureById(failures);
      setGeocodeStatusById(statuses);
    }
    void geocodeStops();
  }, [canEditStopDetails, dossiersById, persistGeocodedToServer, stops]);

  const retryStopGeocoding = useCallback(
    async (stopId: number) => {
      const stop = stops.find((item) => item.id === stopId);
      if (!stop) return;
      const dossier = stop.dossierId != null ? dossiersById.get(stop.dossierId) : undefined;
      const queries = dedupeQueries([
        stop.fullAddress || stop.address || "",
        ...buildGeocodeCandidates({ address: stop.address, row: stop.row }, dossier),
      ]);
      if (queries.length === 0) {
        setGeocodeStatusById((prev) => ({ ...prev, [stopId]: "a_valider" }));
        setGeocodeFailureById((prev) => ({
          ...prev,
          [stopId]: {
            message:
              "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte.",
            addressTried: stop.fullAddress || stop.address || "-",
            originalAddress: stop.fullAddress || stop.address || "-",
          },
        }));
        return;
      }
      setRecheckingStopId(stopId);
      let point: GeocodedPoint | null = null;
      let usedQuery = "";
      for (let index = 0; index < queries.length; index += 1) {
        if (index > 0) {
          await new Promise((r) => setTimeout(r, NOMINATIM_MIN_INTERVAL_MS));
        }
        usedQuery = queries[index];
        point = await geocodeAddress(usedQuery);
        if (point) break;
      }
      if (point) {
        setGeoById((prev) => ({
          ...prev,
          [stopId]: point,
        }));
        setGeocodeStatusById((prev) => ({
          ...prev,
          [stopId]: point.confidence === "exact" ? "exact" : "approximatif",
        }));
        setGeocodeFailureById((prev) => {
          const next = { ...prev };
          delete next[stopId];
          return next;
        });
        if (canEditStopDetails) {
          await persistGeocodedToServer(stopId, point.latitude, point.longitude);
        }
      } else {
        setGeocodeStatusById((prev) => ({ ...prev, [stopId]: "a_valider" }));
        setGeocodeFailureById((prev) => ({
          ...prev,
          [stopId]: {
            message:
              "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte.",
            addressTried: usedQuery || stop.fullAddress || stop.address || "-",
            originalAddress: stop.fullAddress || stop.address || "-",
          },
        }));
      }
      setRecheckingStopId(null);
    },
    [canEditStopDetails, dossiersById, persistGeocodedToServer, stops]
  );

  /** Même ordre que la colonne de gauche (orderedStopIds) ; pas de re-tri ici. La carte reçoit ce tableau tel quel. */
  const mapPoints = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const ordered = orderedStopIds
      .map((id) => byId.get(id))
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
    return ordered
      .filter((stop) => Boolean(geoById[stop.id]))
      .map((stop) => ({
        id: stop.id,
        order: stop.order,
        label: stop.client,
        type: stop.type,
        latitude: geoById[stop.id].latitude,
        longitude: geoById[stop.id].longitude,
      }));
  }, [geoById, orderedStopIds, stops]);

  const stopsNotOnMap = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    return orderedStopIds
      .map((id) => byId.get(id))
      .filter((stop): stop is NonNullable<typeof stop> => {
        if (!stop) return false;
        return !geoById[stop.id];
      });
  }, [geoById, orderedStopIds, stops]);

  const stopsApproximate = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    return orderedStopIds
      .map((id) => byId.get(id))
      .filter(
        (stop): stop is NonNullable<typeof stop> => {
          if (!stop) return false;
          return geocodeStatusById[stop.id] === "approximatif";
        }
      );
  }, [geocodeStatusById, orderedStopIds, stops]);

  const selected = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const ordered = orderedStopIds
      .map((id) => byId.get(id))
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
    return ordered.find((stop) => stop.id === selectedId) ?? ordered[0] ?? null;
  }, [orderedStopIds, selectedId, stops]);

  useEffect(() => {
    if (!selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsEditingStop(false);
      setStopFormMessage("");
      setManualPickStopId(null);
      setManualPositionDraft(null);
      return;
    }
    setStopEditForm({
      adresse: getFieldString(selected.row, ["adresse", "address", "rue"]),
      ville: getFieldString(selected.row, ["ville", "city"]),
      code_postal: getFieldString(selected.row, ["code_postal", "postal_code", "zip"]),
      province: getFieldString(selected.row, ["province", "state"]),
      date_livraison: getFieldString(selected.row, ["date_livraison"]),
      heure_prevue: getFieldString(selected.row, ["heure_prevue"]),
      statut: getFieldString(selected.row, ["statut"]),
      latitude: getFieldString(selected.row, ["latitude", "lat"]),
      longitude: getFieldString(selected.row, ["longitude", "lng", "lon"]),
      note_chauffeur: getFieldString(selected.row, ["note_chauffeur", "note_representant"]),
      commentaire_operationnel: getFieldString(selected.row, [
        "commentaire_operationnel",
        "commentaire",
        "notes_operationnelles",
      ]),
    });
    setStopFormMessage("");
  }, [selected]);

  useEffect(() => {
    async function loadRouteSuggestion() {
      if (!origin || !returnOrigin) {
        setRouteSuggestion(null);
        return;
      }
      const byId = new Map(stops.map((stop) => [stop.id, stop]));
      const orderedStops = orderedStopIds
        .map((id) => byId.get(id))
        .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
      if (orderedStops.length === 0) {
        setRouteSuggestion(null);
        return;
      }

      const payload = {
        depart: {
          label: origin.label,
          lat: origin.latitude,
          lng: origin.longitude,
        },
        retour: {
          label: returnOrigin.label,
          lat: returnOrigin.latitude,
          lng: returnOrigin.longitude,
        },
        stops: orderedStops.map((stop) => {
          const coords = getOperationCoordinates(stop.row);
          return {
            id: String(stop.id),
            nom: stop.client,
            type: stop.type,
            adresse: stop.fullAddress || stop.address || "",
            lat: coords.lat ?? geoById[stop.id]?.latitude ?? null,
            lng: coords.lng ?? geoById[stop.id]?.longitude ?? null,
            heurePlanifiee: stop.time,
          };
        }),
        currentOrderIds: orderedStops.map((stop) => String(stop.id)),
        serviceMinutesParStop: 30,
        heureDepart: "08:00",
      };
      const payloadKey = JSON.stringify(payload);
      if (lastRoutePayloadKeyRef.current === payloadKey) {
        return;
      }
      lastRoutePayloadKeyRef.current = payloadKey;

      setRouteLoading(true);
      try {
        const response = await fetch("/api/livraisons/route-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json().catch(() => ({}))) as RouteSuggestionResponse & {
          message?: string;
          details?: string;
        };
        if (!response.ok) {
          setRouteSuggestion(null);
          setRouteMessage(
            data.message ||
              "Suggestion routiere indisponible pour le moment (OSRM ou donnees invalides)."
          );
          return;
        }
        const resolvedCoords: Record<number, GeocodedPoint> = {};
        const allResolvedStops = [...(data.current?.ordreSuggere ?? []), ...(data.suggested?.ordreSuggere ?? [])];
        allResolvedStops.forEach((stop) => {
          const id = Number(stop.id);
          if (!Number.isFinite(id)) return;
          if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
          resolvedCoords[id] = { latitude: stop.lat, longitude: stop.lng, confidence: "exact" };
        });
        if (Object.keys(resolvedCoords).length > 0) {
          setGeoById((current) => ({ ...current, ...resolvedCoords }));
        }
        setRouteSuggestion(data);
        setRouteMessage("");
      } catch {
        setRouteSuggestion(null);
        setRouteMessage("Suggestion routiere indisponible pour le moment (erreur reseau).");
      } finally {
        setRouteLoading(false);
      }
    }
    if (routeSuggestionTimerRef.current != null) {
      window.clearTimeout(routeSuggestionTimerRef.current);
    }
    routeSuggestionTimerRef.current = window.setTimeout(() => {
      void loadRouteSuggestion();
    }, 900);
    return () => {
      if (routeSuggestionTimerRef.current != null) {
        window.clearTimeout(routeSuggestionTimerRef.current);
      }
    };
  }, [geoById, orderedStopIds, origin, returnOrigin, stops]);

  const routeSummary = useMemo(() => {
    const current = routeSuggestion?.current;
    const suggested = routeSuggestion?.suggested;
    return {
      currentKm: current?.distanceRoutiereTotaleKm ?? 0,
      suggestedKm: suggested?.distanceRoutiereTotaleKm ?? 0,
      currentDriveMinutes: current?.tempsConduiteTotalMinutes ?? 0,
      suggestedDriveMinutes: suggested?.tempsConduiteTotalMinutes ?? 0,
      serviceMinutes: suggested?.tempsServiceTotalMinutes ?? 0,
      totalMinutes: suggested?.tempsJourneeTotalMinutes ?? 0,
      retourEstime: suggested?.retourEstime ?? "--:--",
      suggestedOrder: (suggested?.orderIds ?? []).map((id) => Number(id)).filter(Number.isFinite),
      currentOrder: (current?.orderIds ?? []).map((id) => Number(id)).filter(Number.isFinite),
      routeGeometryLatLng: current?.routeGeometryLatLng ?? [],
      detailedSuggestedStops: suggested?.ordreSuggere ?? [],
      missingStops: routeSuggestion?.warnings?.stopsSansCoordonnees ?? [],
    };
  }, [routeSuggestion]);

  async function persistManualOrder(ids: number[]) {
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const response = await fetch(`/api/livraisons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ordre_arret: i + 1 }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!response.ok || !data.updated_row) {
        setRouteMessage(
          `Erreur de sauvegarde de l'ordre manuel : ${data.error?.message ?? "erreur inconnue"}`
        );
        return false;
      }
      const updatedRow = data.updated_row;
      setRows((current) =>
        current.map((row) => (Number(row.id) === id ? { ...row, ...updatedRow } : row))
      );
    }
    return true;
  }

  async function moveStop(dragId: number, targetId: number) {
    if (!canManageOrder || dragId === targetId) return;
    const next = [...orderedStopIds];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderedStopIds(next);
    await persistManualOrder(next);
  }

  async function applySuggestedOrder() {
    if (!canManageOrder || routeSummary.suggestedOrder.length === 0) return;
    setRouteApplying(true);
    setRouteMessage("");
    const remaining = orderedStopIds.filter((id) => !routeSummary.suggestedOrder.includes(id));
    const nextOrder = [...routeSummary.suggestedOrder, ...remaining];
    setOrderedStopIds(nextOrder);
    for (let i = 0; i < nextOrder.length; i += 1) {
      const id = nextOrder[i];
      const response = await fetch(`/api/livraisons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ordre_arret: i + 1 }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!response.ok || !data.updated_row) {
        setRouteMessage(
          `Echec de l'application de l'ordre suggere : ${data.error?.message ?? "erreur inconnue"}`
        );
        setRouteApplying(false);
        return;
      }
      const updatedRow = data.updated_row;
      setRows((current) =>
        current.map((row) => (Number(row.id) === id ? { ...row, ...updatedRow } : row))
      );
    }
    setRouteMessage("Ordre suggere applique.");
    setRouteApplying(false);
  }

  async function saveStopInline() {
    if (!selected || !canEditStopDetails) return;
    setSavingStop(true);
    setStopFormMessage("");

    const nextLatitude = parseNumericOrNull(stopEditForm.latitude.trim());
    const nextLongitude = parseNumericOrNull(stopEditForm.longitude.trim());
    if (
      (stopEditForm.latitude.trim() && nextLatitude == null) ||
      (stopEditForm.longitude.trim() && nextLongitude == null)
    ) {
      setSavingStop(false);
      setStopFormMessage("Latitude/longitude invalides.");
      return;
    }

    const payload = {
      adresse: stopEditForm.adresse.trim() || null,
      ville: stopEditForm.ville.trim() || null,
      code_postal: stopEditForm.code_postal.trim() || null,
      province: stopEditForm.province.trim() || null,
      date_livraison: stopEditForm.date_livraison.trim() || null,
      heure_prevue: stopEditForm.heure_prevue.trim() || null,
      statut: stopEditForm.statut.trim() || null,
      latitude: nextLatitude,
      longitude: nextLongitude,
      note_chauffeur: stopEditForm.note_chauffeur.trim() || null,
      commentaire_operationnel: stopEditForm.commentaire_operationnel.trim() || null,
    };

    const response = await fetch(`/api/livraisons/${selected.id}/inline-stop`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseData = (await response.json().catch(() => ({}))) as unknown;

    if (!response.ok) {
      const errorMessage = formatApiErrorDetails(responseData, payload);
      console.warn("[DayOperationsView] saveStopInline API failed", {
        selectedId: selected.id,
        payload,
        responseData,
      });
      setSavingStop(false);
      setStopFormMessage(`Echec enregistrement.\n${errorMessage}`);
      return;
    }

    const updatedRow =
      responseData && typeof responseData === "object" && "updated_row" in responseData
        ? ((responseData as { updated_row?: Record<string, unknown> }).updated_row ?? null)
        : null;
    if (!updatedRow || !Number.isFinite(Number(updatedRow.id))) {
      setSavingStop(false);
      setStopFormMessage(
        "Aucune ligne mise a jour. Probable blocage RLS/policy ou filtre id."
      );
      return;
    }
    const updatedRowAsRow = updatedRow as Row;

    setRows((current) =>
      current.map((row) => {
        if (Number(row.id) !== selected.id) return row;
        return { ...row, ...updatedRowAsRow };
      })
    );

    const latForMap = parseNumericOrNull(String(updatedRow.latitude ?? ""));
    const lngForMap = parseNumericOrNull(String(updatedRow.longitude ?? ""));
    if (latForMap != null && lngForMap != null) {
      setGeocodeStatusById((prev) => ({ ...prev, [selected.id]: "exact" }));
      setGeocodeFailureById((prev) => {
        if (!(selected.id in prev)) return prev;
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
      setGeoById((current) => ({
        ...current,
        [selected.id]: { latitude: latForMap, longitude: lngForMap, confidence: "exact" },
      }));
    } else {
      setGeocodeStatusById((prev) => ({ ...prev, [selected.id]: "a_valider" }));
      setGeoById((current) => {
        const next = { ...current };
        delete next[selected.id];
        return next;
      });
    }

    setIsEditingStop(false);
    setSavingStop(false);
    const warning =
      responseData && typeof responseData === "object" && "warning" in responseData
        ? String((responseData as { warning?: unknown }).warning ?? "")
        : "";
    setStopFormMessage(warning || "Arret mis a jour.");
  }

  async function searchPositionFromEditedAddress() {
    if (!selected) return;
    setSearchingPosition(true);
    setStopFormMessage("");
    const queries = buildGeocodeCandidatesFromParts(stopEditForm);
    if (queries.length === 0) {
      setSearchingPosition(false);
      setStopFormMessage(
        "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte."
      );
      return;
    }
    let point: GeocodedPoint | null = null;
    for (let index = 0; index < queries.length; index += 1) {
      if (index > 0) {
        await new Promise((r) => setTimeout(r, NOMINATIM_MIN_INTERVAL_MS));
      }
      point = await geocodeAddress(queries[index]);
      if (point) break;
    }
    if (!point) {
      setSearchingPosition(false);
      setStopFormMessage(
        "Adresse a valider. Nous n avons pas pu positionner cette adresse automatiquement sur la carte."
      );
      setGeocodeStatusById((prev) => ({ ...prev, [selected.id]: "a_valider" }));
      return;
    }

    setStopEditForm((prev) => ({
      ...prev,
      latitude: String(point.latitude),
      longitude: String(point.longitude),
    }));
    setGeoById((prev) => ({
      ...prev,
      [selected.id]: point,
    }));
    setGeocodeStatusById((prev) => ({
      ...prev,
      [selected.id]: point.confidence === "exact" ? "exact" : "approximatif",
    }));
    setSearchingPosition(false);
    setStopFormMessage(
      point.confidence === "exact"
        ? "Adresse localisee."
        : "Position approximative a valider."
    );
  }

  async function runQuickStopAction(
    action: "replanifier" | "annuler" | "supprimer" | "completer"
  ) {
    if (!selected || !canEditStopDetails) return;
    const actionKey = `${action}:${selected.id}`;
    if (action === "supprimer") {
      const confirmed = window.confirm("Confirmer la suppression de cet arret ?");
      if (!confirmed) return;
    }
    setQuickActionLoading(actionKey);
    setStopFormMessage("");
    try {
      if (action === "supprimer") {
        const response = await fetch(`/api/livraisons/${selected.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        if (!response.ok) {
          setStopFormMessage(
            `Suppression impossible : ${data.error?.message ?? "erreur inconnue"}`
          );
          return;
        }
        setRows((current) => current.filter((row) => Number(row.id) !== selected.id));
        setGeocodeFailureById((prev) => {
          const next = { ...prev };
          delete next[selected.id];
          return next;
        });
        setGeoById((prev) => {
          const next = { ...prev };
          delete next[selected.id];
          return next;
        });
        setStopFormMessage("Arret supprime.");
        return;
      }

      const patch: Record<string, unknown> = {};
      if (action === "annuler") patch.statut = "annulee";
      if (action === "replanifier") patch.statut = "planifiee";
      if (action === "completer") {
        patch.statut = selected.type === "ramassage" ? "ramassee" : "livree";
      }

      const response = await fetch(`/api/livraisons/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        updated_row?: Row;
        error?: { message?: string };
      };
      if (!response.ok || !data.updated_row) {
        setStopFormMessage(
          `Action rapide indisponible : ${data.error?.message ?? "erreur inconnue"}`
        );
        return;
      }
      const updatedRow = data.updated_row;
      setRows((current) =>
        current.map((row) => (Number(row.id) === selected.id ? { ...row, ...updatedRow } : row))
      );
      setStopFormMessage(
        action === "annuler"
          ? "Arret annule."
          : action === "replanifier"
            ? "Arret replanifie."
            : "Arret marque complete."
      );
    } finally {
      setQuickActionLoading(null);
    }
  }

  function startManualPositionMode(stopId: number) {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop) return;
    const existing = geoById[stopId];
    const rawCoords = getOperationCoordinates(stop.row);
    const fallback =
      existing ??
      (rawCoords.lat != null && rawCoords.lng != null
        ? { latitude: rawCoords.lat, longitude: rawCoords.lng, confidence: "approximatif" as const }
        : null);
    const centerFallback =
      fallback ??
      (origin
        ? { latitude: origin.latitude, longitude: origin.longitude, confidence: "approximatif" as const }
        : returnOrigin
          ? { latitude: returnOrigin.latitude, longitude: returnOrigin.longitude, confidence: "approximatif" as const }
          : { latitude: 46.8139, longitude: -71.2082, confidence: "approximatif" as const });
    setManualPositionDraft({
      latitude: centerFallback.latitude,
      longitude: centerFallback.longitude,
    });
    setManualPickStopId(stopId);
    setIsEditingStop(true);
    setShowDetail(true);
    setStopFormMessage("Mode position manuelle active. Deplacez le point puis cliquez Accepter la position.");
  }

  function cancelManualPositionMode() {
    setManualPickStopId(null);
    setManualPositionDraft(null);
    setStopFormMessage("Position manuelle annulee.");
  }

  async function acceptManualPosition() {
    if (manualPickStopId == null || !manualPositionDraft) return;
    const stopId = manualPickStopId;
    const coords = manualPositionDraft;

    setGeoById((prev) => ({
      ...prev,
      [stopId]: { ...coords, confidence: "exact" },
    }));
    setGeocodeStatusById((prev) => ({ ...prev, [stopId]: "manuelle" }));
    setGeocodeFailureById((prev) => {
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
    setRows((current) =>
      current.map((row) =>
        Number(row.id) === stopId
          ? { ...row, latitude: coords.latitude, longitude: coords.longitude }
          : row
      )
    );
    if (selected?.id === stopId) {
      setStopEditForm((prev) => ({
        ...prev,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      }));
    }

    let saved = true;
    if (canEditStopDetails) {
      saved = await persistGeocodedToServer(stopId, coords.latitude, coords.longitude);
    }

    setManualPickStopId(null);
    setManualPositionDraft(null);
    setStopFormMessage(
      saved
        ? "Position definie manuellement et sauvegardee."
        : "Position appliquee localement, mais non sauvegardee. Veuillez reessayer."
    );
  }

  if (accessLoading || loading) {
    return (
      <main className="page-container">
        <HeaderTagora title="Journee livraison & ramassage" subtitle="Chargement" />
        <SectionCard title="Chargement" subtitle="Preparation de la journee." />
      </main>
    );
  }

  if (!user || !canUseLivraisons) {
    return (
      <main className="page-container">
        <HeaderTagora title="Journee livraison & ramassage" subtitle="Acces requis" />
        <SectionCard title="Acces refuse" subtitle="Permission livraisons requise." />
      </main>
    );
  }

  const kpiCards = [
    { label: "Operations", value: String(stops.length) },
    { label: "Distance routiere actuelle", value: `${routeSummary.currentKm.toFixed(1)} km` },
    { label: "Distance routiere suggeree", value: `${routeSummary.suggestedKm.toFixed(1)} km` },
    { label: "Conduite actuelle", value: `${routeSummary.currentDriveMinutes} min` },
    { label: "Conduite suggeree", value: `${routeSummary.suggestedDriveMinutes} min` },
    { label: "Service total (30 min/arret)", value: `${routeSummary.serviceMinutes} min` },
    { label: "Duree totale estimee", value: `${routeSummary.totalMinutes} min` },
    { label: "Retour estime", value: routeSummary.retourEstime },
    {
      label: "Gain estime",
      value: `${Math.max(0, routeSummary.currentKm - routeSummary.suggestedKm).toFixed(1)} km`,
    },
  ];

  return (
    <main className="page-container">
      <section
        className="tagora-panel"
        style={{
          marginTop: 8,
          padding: 16,
          borderRadius: 18,
          background:
            "linear-gradient(135deg, rgba(15,41,72,0.96) 0%, rgba(24,72,124,0.92) 52%, rgba(37,99,235,0.82) 100%)",
          boxShadow: "0 14px 32px rgba(15, 41, 72, 0.24)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: "0.08em",
                color: "#0f2948",
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(255,255,255,0.9)",
              }}
            >
              TAGORA
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, justifyItems: "center", textAlign: "center" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <h1 style={{ margin: 0, color: "#f8fafc", fontSize: 24, lineHeight: 1.1 }}>
                Journee livraison & ramassage
              </h1>
              <span style={{ color: "rgba(226,232,240,0.95)", fontSize: 12 }}>
                Planification, suivi et coordination des arrets du jour ·{" "}
                {dateIso ? formatDateLabel(dateIso) : "Date manquante"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <Link
                href={area === "direction" ? "/direction/livraisons" : "/employe/livraisons"}
                className="tagora-dark-outline-action day-ops-compact-btn"
                style={{ borderColor: "rgba(255,255,255,0.65)", color: "#ffffff", background: "transparent" }}
              >
                Retour
              </Link>
              {area === "direction" ? (
                <Link
                  href="/direction/dashboard"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  style={{ borderColor: "rgba(255,255,255,0.65)", color: "#ffffff", background: "transparent" }}
                >
                  Tableau de bord direction
                </Link>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <StatusBadge
              label={role === "admin" ? "Compte admin" : "Compte direction"}
              tone={role === "admin" ? "success" : "warning"}
            />
          </div>
        </div>
      </section>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 10,
          alignItems: "stretch",
        }}
      >
        {kpiCards.map((item) => (
          <AppCard
            key={item.label}
            tone="muted"
            style={{
              minHeight: 92,
              display: "grid",
              gap: 6,
              alignContent: "space-between",
              border: "1px solid #dbe4f0",
              boxShadow: "0 8px 16px rgba(15, 41, 72, 0.08)",
              borderRadius: 14,
            }}
          >
            <span className="ui-text-muted" style={{ fontSize: 12, fontWeight: 700 }}>
              {item.label}
            </span>
            <strong style={{ fontSize: 22, color: "#0f2948", lineHeight: 1.05 }}>{item.value}</strong>
          </AppCard>
        ))}
      </div>

      <div className="day-ops-layout" style={{ marginTop: 12 }}>
        <section
          className="tagora-panel ui-stack-sm day-ops-left-col"
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            padding: 14,
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Arrets du jour
            </h2>
            <Link
              href={area === "direction" ? "/direction/livraisons" : "/employe/livraisons"}
              className="tagora-dark-outline-action day-ops-compact-btn"
            >
              Retour calendrier
            </Link>
          </div>
          {stops.length === 0 ? (
            <AppCard tone="muted">
              <span className="ui-text-muted">Aucune operation pour cette date.</span>
            </AppCard>
          ) : (
            <>
            <AppCard
                tone="muted"
                style={{
                  padding: 10,
                  border: "1px solid #16a34a",
                  background: "rgba(240, 253, 244, 0.9)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>#0 DEPOT OLIEM</strong>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>Point de depart</span>
                    <span className="ui-text-muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                      {origin?.label ?? "Oliem Solutions"}
                    </span>
                  </div>
                  <StatusBadge label="DEPART" tone="success" />
                </div>
              </AppCard>
              {orderedStopIds
                .map((id) => stops.find((item) => item.id === id))
                .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop))
                .map((stop, index) => (
                <button
                  key={stop.id}
                  type="button"
                  draggable={canManageOrder}
                  onDragStart={() => setDraggingId(stop.id)}
                  onDragOver={(event) => {
                    if (canManageOrder) event.preventDefault();
                  }}
                  onDrop={() => {
                    if (canManageOrder && draggingId != null) {
                      void moveStop(draggingId, stop.id);
                    }
                    setDraggingId(null);
                  }}
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  onClick={() => {
                    setSelectedId(stop.id);
                    setShowDetail(true);
                  }}
                  style={{
                    minHeight: 62,
                    padding: "8px 10px",
                    textAlign: "left",
                    justifyContent: "space-between",
                    borderColor: selected?.id === stop.id ? "#0f2948" : undefined,
                    background: selected?.id === stop.id ? "#f8fafc" : "#fff",
                    width: "100%",
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: 12, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                      #{index + 1} {stop.client}
                    </strong>
                    <span className="ui-text-muted" style={{ fontSize: 11 }}>
                      {stop.type === "ramassage" ? "Ramassage" : "Livraison"} · {stop.time}
                    </span>
                    <span className="ui-text-muted" style={{ fontSize: 11, overflowWrap: "anywhere" }}>
                      {stop.fullAddress || stop.address || "Adresse non renseignee"}
                    </span>
                    {!stop.hasReliableAddress ? (
                      <span className="ui-text-muted" style={{ color: "#b45309", fontWeight: 700, fontSize: 11 }}>
                        Adresse incomplete pour geocodage fiable.
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {stop.isOverdue ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c" }}>RETARD</span>
                    ) : null}
                    <StatusBadge label={stop.statusText} tone={stop.statusTone} />
                  </div>
                </button>
              ))}
              <AppCard
                tone="muted"
                style={{
                  padding: 10,
                  border: "1px solid #b45309",
                  background: "rgba(255, 247, 237, 0.95)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <strong style={{ fontSize: 13 }}>#{orderedStopIds.length + 1} RETOUR</strong>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>Point de retour</span>
                    <span className="ui-text-muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                      {returnOrigin?.label ?? origin?.label ?? "Oliem Solutions"}
                    </span>
                  </div>
                  <StatusBadge label="RETOUR" tone="warning" />
                </div>
              </AppCard>
            </>
          )}
        </section>

        <section
          className="ui-stack-md day-ops-right-col"
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            display: "grid",
            gridTemplateRows: "auto auto auto",
            gap: 14,
            alignContent: "start",
          }}
        >
          <section
            className="tagora-panel day-ops-map-panel"
            style={{
              padding: 16,
              minWidth: 0,
              boxSizing: "border-box",
              border: "1px solid #cddbee",
              boxShadow: "0 14px 30px rgba(15, 41, 72, 0.12)",
              background: "#ffffff",
            }}
          >
            <h2 className="section-title" style={{ marginBottom: 10 }}>
              Carte de la journee
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
              <label className="tagora-field" style={{ margin: 0, flex: "1 1 320px" }}>
                <span className="tagora-label">Point de depart</span>
                <input
                  type="text"
                  className="tagora-input"
                  value={originAddressInput}
                  onChange={(event) => setOriginAddressInput(event.target.value)}
                  placeholder="Adresse de depart (ex: Oliem Solutions, Quebec)"
                />
              </label>
              <button
                type="button"
                className="tagora-dark-outline-action day-ops-compact-btn"
                onClick={() => void updateOriginFromAddress()}
                disabled={originUpdating}
              >
                {originUpdating ? "Geocodage..." : "Mettre a jour"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
              <label className="tagora-field" style={{ margin: 0, flex: "1 1 320px" }}>
                <span className="tagora-label">Point de retour</span>
                <input
                  type="text"
                  className="tagora-input"
                  value={returnAddressInput}
                  onChange={(event) => setReturnAddressInput(event.target.value)}
                  placeholder="Adresse de retour (par defaut identique au depart)"
                />
              </label>
              <button
                type="button"
                className="tagora-dark-outline-action day-ops-compact-btn"
                onClick={() => void updateReturnFromAddress()}
                disabled={returnUpdating}
              >
                {returnUpdating ? "Geocodage..." : "Mettre a jour"}
              </button>
            </div>
            {origin ? (
              <p className="ui-text-muted" style={{ marginTop: 0 }}>
                Origine active: <strong>{origin.label}</strong> ({origin.latitude.toFixed(5)}, {origin.longitude.toFixed(5)})
              </p>
            ) : (
              <p className="ui-text-muted" style={{ marginTop: 0 }}>
                Origine non definie.
              </p>
            )}
            {stopsNotOnMap.length > 0 ? (
              <p className="ui-text-muted" style={{ margin: "0 0 8px" }}>
                {stopsNotOnMap.length} arret{stopsNotOnMap.length > 1 ? "s" : ""} sans position sur
                la carte : {stopsNotOnMap.map((s) => s.client).join(", ")}. La ligne relie le depot,
                les arrets geolocalises (dans l&apos;ordre de la liste), puis le retour.
              </p>
            ) : null}
            {stopsApproximate.length > 0 ? (
              <p className="ui-text-muted" style={{ margin: "0 0 8px", color: "#b45309" }}>
                Position approximative a valider : {stopsApproximate.map((s) => s.client).join(", ")}.
              </p>
            ) : null}
            {manualPickStopId != null ? (
              <div
                className="tagora-panel-muted"
                style={{ margin: "0 0 8px", padding: 10, border: "1px solid #f59e0b", background: "#fff7ed" }}
              >
                <strong>Position manuelle en cours</strong>
                <div className="ui-text-muted" style={{ marginTop: 4 }}>
                  Arret selectionne :{" "}
                  {stops.find((stop) => stop.id === manualPickStopId)?.order ?? "-"}{" "}
                  {stops.find((stop) => stop.id === manualPickStopId)?.client ?? ""}
                </div>
                <div className="ui-text-muted" style={{ marginTop: 4 }}>
                  Deplacez le point sur la carte, puis cliquez Accepter la position.
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="tagora-dark-action day-ops-compact-btn"
                    disabled={!manualPositionDraft}
                    onClick={() => void acceptManualPosition()}
                  >
                    Accepter la position
                  </button>
                  <button
                    type="button"
                    className="tagora-dark-outline-action day-ops-compact-btn"
                    onClick={() => cancelManualPositionMode()}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}
            {Object.keys(geocodeFailureById).length > 0 ? (
              <div
                className="tagora-panel"
                style={{
                  margin: "0 0 8px",
                  padding: 10,
                  fontSize: 12,
                  background: "rgba(255, 247, 237, 0.95)",
                  border: "1px solid #f59e0b",
                }}
              >
                <strong>Adresse a valider</strong>
                <div className="ui-text-muted" style={{ marginTop: 4 }}>
                  Nous n avons pas pu positionner automatiquement certaines adresses sur la carte.
                </div>
                <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                  {Object.entries(geocodeFailureById).map(([id, item]) => {
                    const st = stops.find((s) => s.id === Number(id));
                    return (
                      <li key={id} style={{ marginBottom: 4 }}>
                        <strong>{st?.client ?? `Arret ${id}`}</strong>
                        <div className="ui-text-muted" style={{ marginTop: 2 }}>
                          Adresse originale: {item.originalAddress}
                        </div>
                        <div className="ui-text-muted" style={{ marginTop: 2 }}>
                          Derniere tentative: {item.addressTried}
                        </div>
                        <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="tagora-dark-outline-action day-ops-compact-btn"
                            onClick={() => {
                              setSelectedId(Number(id));
                              setShowDetail(true);
                              setIsEditingStop(true);
                              setStopFormMessage(item.message);
                            }}
                          >
                            Corriger l adresse
                          </button>
                          <button
                            type="button"
                            className="tagora-dark-outline-action day-ops-compact-btn"
                            disabled={recheckingStopId === Number(id)}
                            onClick={() => void retryStopGeocoding(Number(id))}
                          >
                            {recheckingStopId === Number(id) ? "Recherche..." : "Rechercher a nouveau"}
                          </button>
                          <button
                            type="button"
                            className="tagora-dark-outline-action day-ops-compact-btn"
                            onClick={() => {
                              setSelectedId(Number(id));
                              setShowDetail(true);
                              startManualPositionMode(Number(id));
                            }}
                          >
                            Definir la position sur la carte
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="day-ops-map-wrap">
              <DayOperationsMap
                points={mapPoints}
                selectedId={selected?.id ?? null}
                onSelect={(id) => setSelectedId(id)}
                origin={origin}
                returnOrigin={returnOrigin}
                routeGeometryLatLng={routeSummary.routeGeometryLatLng}
                manualPickMode={manualPickStopId != null}
                manualPickStopLabel={selected?.client}
                manualDraft={manualPositionDraft}
                onManualDraftChange={(coords) => setManualPositionDraft(coords)}
              />
            </div>
          </section>

          <section
            className="tagora-panel ui-stack-sm"
            style={{
              padding: 14,
              minWidth: 0,
              boxSizing: "border-box",
              border: "1px solid #d9e4f2",
              boxShadow: "0 8px 18px rgba(15, 41, 72, 0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                Suggestion de route
              </h2>
              {canManageOrder ? (
                <button
                  type="button"
                  className="tagora-dark-action day-ops-compact-btn"
                  disabled={routeApplying || routeSummary.suggestedOrder.length === 0}
                  onClick={() => void applySuggestedOrder()}
                >
                  {routeApplying ? "Application..." : "Appliquer ordre suggere"}
                </button>
              ) : null}
            </div>
            {routeMessage ? <p className="ui-text-muted" style={{ margin: 0 }}>{routeMessage}</p> : null}
            {routeLoading ? <p className="ui-text-muted" style={{ margin: 0 }}>Calcul routier en cours...</p> : null}
            {routeSummary.missingStops.length > 0 ? (
              <div className="ui-stack-xs">
                <p className="ui-text-muted" style={{ margin: 0, color: "#b45309", fontWeight: 700 }}>
                  {routeSummary.missingStops.length} arret(s) exclus de la suggestion: coordonnees manquantes.
                </p>
                <div className="ui-text-muted" style={{ fontSize: 12 }}>
                  {routeSummary.missingStops
                    .map((stop) => `${stop.nom || stop.id}${stop.adresse ? ` (${stop.adresse})` : ""}`)
                    .join(" ; ")}
                </div>
              </div>
            ) : null}
            <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
              <div className="ui-grid-2" style={{ gap: 8 }}>
                <div><strong>Depart:</strong> {origin?.label ?? "Non defini"}</div>
                <div><strong>Retour:</strong> {returnOrigin?.label ?? origin?.label ?? "Non defini"}</div>
                <div><strong>Distance routiere actuelle:</strong> {routeSummary.currentKm.toFixed(1)} km</div>
                <div><strong>Distance routiere suggeree:</strong> {routeSummary.suggestedKm.toFixed(1)} km</div>
                <div><strong>Temps conduite actuel:</strong> {routeSummary.currentDriveMinutes} min</div>
                <div><strong>Temps conduite suggere:</strong> {routeSummary.suggestedDriveMinutes} min</div>
                <div><strong>Temps service total:</strong> {routeSummary.serviceMinutes} min</div>
                <div><strong>Duree totale:</strong> {routeSummary.totalMinutes} min</div>
                <div><strong>Retour estime:</strong> {routeSummary.retourEstime}</div>
              </div>
              <div style={{ wordBreak: "break-word" }}>
                <strong>Ordre actuel:</strong>{" "}
                {routeSummary.currentOrder.length > 0
                  ? routeSummary.currentOrder
                      .map((id) => {
                        const stop = stops.find((item) => item.id === id);
                        return stop ? `#${stop.order} ${stop.client}` : `#${id}`;
                      })
                      .join(" -> ")
                  : "-"}
              </div>
              <div style={{ wordBreak: "break-word" }}>
                <strong>Ordre suggere:</strong>{" "}
                {routeSummary.suggestedOrder.length > 0
                  ? routeSummary.suggestedOrder
                      .map((id, index) => {
                        const stop = stops.find((item) => item.id === id);
                        return stop ? `#${index + 1} ${stop.client}` : `#${id}`;
                      })
                      .join(" -> ")
                  : "—"}
              </div>
              <div>
                <strong>Gain estime:</strong>{" "}
                {`${Math.max(0, routeSummary.currentKm - routeSummary.suggestedKm).toFixed(1)} km`}
              </div>
              {routeSummary.detailedSuggestedStops.length > 0 ? (
                <div className="ui-stack-xs" style={{ marginTop: 6 }}>
                  <strong>Detail des arrets (ordre suggere):</strong>
                  {routeSummary.detailedSuggestedStops.map((stop) => (
                    <div key={stop.id} className="ui-text-muted" style={{ fontSize: 12 }}>
                      #{stop.ordre} {stop.nom} · {stop.adresse || "Adresse non renseignee"} ·{" "}
                      {stop.tempsConduiteDepuisPrecedentMinutes} min route · arrivee {stop.arriveeEstimee} ·
                      service {stop.tempsServiceMinutes} min · depart {stop.departEstime}
                    </div>
                  ))}
                </div>
              ) : null}
            </AppCard>
          </section>

          {selected ? (
            <section
              className="tagora-panel ui-stack-xs"
              style={{
                padding: 14,
                minWidth: 0,
                boxSizing: "border-box",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(15, 41, 72, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <h2 className="section-title" style={{ marginBottom: 0 }}>
                    Detail arret
                  </h2>
                  <span className="ui-text-muted" style={{ fontSize: 12 }}>
                    Lecture operationnelle rapide
                  </span>
                </div>
                <button
                  type="button"
                  className="tagora-dark-outline-action day-ops-compact-btn"
                  onClick={() => setShowDetail((prev) => !prev)}
                >
                  {showDetail ? "Masquer" : "Afficher"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.35fr 1fr",
                  gap: 10,
                  alignItems: "stretch",
                }}
              >
                <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                  <div style={{ display: "grid", gap: 2 }}>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>
                      Client
                    </span>
                    <strong style={{ fontSize: 15 }}>{selected.client}</strong>
                  </div>
                  <div style={{ display: "grid", gap: 2 }}>
                    <span className="ui-text-muted" style={{ fontSize: 12 }}>
                      Adresse
                    </span>
                    <span>{selected.fullAddress || selected.address || "Adresse non renseignee"}</span>
                  </div>
                </AppCard>
                <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                  <div><strong>Heure:</strong> {selected.time}</div>
                  <div><strong>Type:</strong> {selected.type === "ramassage" ? "Ramassage" : "Livraison"}</div>
                  <div><strong>Statut:</strong> {selected.statusText}</div>
                  <div>
                    <strong>Geolocalisation:</strong>{" "}
                    {geocodeStatusById[selected.id] === "approximatif"
                      ? "Position approximative a valider"
                      : geocodeStatusById[selected.id] === "manuelle"
                        ? "Position definie manuellement"
                      : geocodeStatusById[selected.id] === "a_valider"
                        ? "Adresse a valider"
                        : "Adresse localisee"}
                  </div>
                  <div><strong>Dossier:</strong> {selected.dossierId ?? "-"}</div>
                  <div><strong>Commande:</strong> {String(selected.row.numero_commande || selected.row.commande || "-")}</div>
                  <div><strong>Facture:</strong> {String(selected.row.numero_facture || selected.row.facture || "-")}</div>
                </AppCard>
              </div>

              {(() => {
                const scheduledByName =
                  getFieldString(selected.row, ["scheduled_by_name", "created_by_name"]) || "-";
                const createdAtRaw = getFieldString(selected.row, ["created_at"]);
                const createdAtLabel = formatAuditTimestamp(createdAtRaw) || "-";
                const updatedByName = getFieldString(selected.row, ["updated_by_name"]);
                const updatedAtRaw = getFieldString(selected.row, ["updated_at"]);
                const updatedAtLabel = formatAuditTimestamp(updatedAtRaw);
                const createdById = getFieldString(selected.row, [
                  "scheduled_by_user_id",
                  "created_by_user_id",
                ]);
                const updatedById = getFieldString(selected.row, ["updated_by_user_id"]);
                const hasDistinctUpdate =
                  Boolean(updatedByName || updatedAtLabel) &&
                  (updatedById !== createdById ||
                    (updatedAtRaw && createdAtRaw && updatedAtRaw !== createdAtRaw));

                return (
                  <AppCard
                    tone="muted"
                    className="ui-stack-xs"
                    style={{
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      background: "#f1f5f9",
                    }}
                    aria-label="Tracabilite de la livraison"
                  >
                    <strong style={{ fontSize: 13 }}>Tracabilite</strong>
                    <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                      <div>
                        <strong>Programme par :</strong> {scheduledByName}
                      </div>
                      <div>
                        <strong>Cree le :</strong> {createdAtLabel}
                      </div>
                      {hasDistinctUpdate ? (
                        <>
                          <div>
                            <strong>Derniere modification par :</strong>{" "}
                            {updatedByName || "-"}
                          </div>
                          <div>
                            <strong>Derniere modification :</strong>{" "}
                            {updatedAtLabel || "-"}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </AppCard>
                );
              })()}

              {canEditStopDetails ? (
                <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                  <strong>Actions rapides</strong>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      onClick={() => {
                        setIsEditingStop(true);
                        setShowDetail(true);
                        setStopFormMessage("");
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      disabled={quickActionLoading === `replanifier:${selected.id}`}
                      onClick={() => void runQuickStopAction("replanifier")}
                    >
                      Replanifier
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      disabled={quickActionLoading === `annuler:${selected.id}`}
                      onClick={() => void runQuickStopAction("annuler")}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      disabled={quickActionLoading === `completer:${selected.id}`}
                      onClick={() => void runQuickStopAction("completer")}
                    >
                      {selected.type === "ramassage" ? "Marquer ramasse" : "Marquer livre"}
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="tagora-dark-outline-action day-ops-compact-btn"
                        disabled={quickActionLoading === `supprimer:${selected.id}`}
                        onClick={() => void runQuickStopAction("supprimer")}
                      >
                        Supprimer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="tagora-dark-outline-action day-ops-compact-btn"
                      onClick={() => {
                        startManualPositionMode(selected.id);
                      }}
                    >
                      Definir position carte
                    </button>
                  </div>
                </AppCard>
              ) : null}

              <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                <InternalMentionsPanel
                  entityType={selected.type === "ramassage" ? "ramassage" : "livraison"}
                  entityId={selected.id}
                  recipients={chauffeurs.filter((item) => {
                    const actifValue = String(item.actif ?? "true").toLowerCase();
                    return actifValue !== "false" && actifValue !== "0";
                  }).map((item) => {
                    const fullName = [item.prenom, item.nom].filter(Boolean).map(String).join(" ").trim();
                    return {
                      id: Number(item.id),
                      name: String(item.nom_complet || item.nom || fullName || `#${String(item.id)}`),
                      email: typeof item.courriel === "string" ? item.courriel : null,
                      active: true,
                    };
                  })}
                  context={{
                    title: selected.client,
                    client: selected.client,
                    adresse: selected.fullAddress || selected.address || "",
                    commande: String(selected.row.numero_commande || selected.row.commande || ""),
                    facture: String(selected.row.numero_facture || selected.row.facture || ""),
                    date: String(selected.row.date_livraison || ""),
                    heure: String(selected.row.heure_prevue || selected.time || ""),
                    statut: String(selected.row.statut || selected.statusText || ""),
                    dossier: String(selected.dossierId || selected.row.dossier_id || ""),
                    vehicule: String(selected.row.vehicule_id || selected.row.vehicule || ""),
                    remorque: String(selected.row.remorque_id || selected.row.remorque || ""),
                    chauffeur: String(selected.row.chauffeur_id || selected.row.chauffeur || ""),
                    linkPath:
                      selected.type === "ramassage"
                        ? `/direction/ramassages`
                        : `/direction/livraisons/jour?date=${encodeURIComponent(dateIso)}`,
                  }}
                />
              </AppCard>

              {showDetail ? (
                <>
                  {canEditStopDetails ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action day-ops-compact-btn"
                        onClick={() => {
                          setIsEditingStop((prev) => !prev);
                          setStopFormMessage("");
                        }}
                      >
                        {isEditingStop ? "Annuler" : "Modifier"}
                      </button>
                    </div>
                  ) : null}

                  {isEditingStop && canEditStopDetails ? (
                    <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                      <div className="ui-grid-2">
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Adresse</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.adresse}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, adresse: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Ville</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.ville}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, ville: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Code postal</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.code_postal}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, code_postal: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Province</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.province}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, province: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Date livraison</span>
                          <input
                            type="date"
                            className="tagora-input"
                            value={stopEditForm.date_livraison}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, date_livraison: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Heure prevue</span>
                          <input
                            type="time"
                            className="tagora-input"
                            value={stopEditForm.heure_prevue}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, heure_prevue: event.target.value }))
                            }
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Statut</span>
                          <select
                            className="tagora-input"
                            value={stopEditForm.statut}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, statut: event.target.value }))
                            }
                          >
                            <option value="">--</option>
                            <option value="planifiee">Planifiee</option>
                            <option value="en_cours">En cours</option>
                            <option value="livree">Livree</option>
                            <option value="ramassee">Ramassee</option>
                            <option value="annulee">Annulee</option>
                          </select>
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Latitude</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.latitude}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, latitude: event.target.value }))
                            }
                            placeholder="ex: 46.81388"
                          />
                        </label>
                        <label className="tagora-field" style={{ margin: 0 }}>
                          <span className="tagora-label">Longitude</span>
                          <input
                            className="tagora-input"
                            value={stopEditForm.longitude}
                            onChange={(event) =>
                              setStopEditForm((prev) => ({ ...prev, longitude: event.target.value }))
                            }
                            placeholder="ex: -71.20798"
                          />
                        </label>
                      </div>
                      <label className="tagora-field" style={{ margin: 0 }}>
                        <span className="tagora-label">Note chauffeur / representant</span>
                        <textarea
                          className="tagora-textarea"
                          value={stopEditForm.note_chauffeur}
                          onChange={(event) =>
                            setStopEditForm((prev) => ({
                              ...prev,
                              note_chauffeur: event.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Ex: appeler avant arrivee, acces quai arriere, code porte..."
                        />
                      </label>
                      <label className="tagora-field" style={{ margin: 0 }}>
                        <span className="tagora-label">Commentaire operationnel</span>
                        <textarea
                          className="tagora-textarea"
                          value={stopEditForm.commentaire_operationnel}
                          onChange={(event) =>
                            setStopEditForm((prev) => ({
                              ...prev,
                              commentaire_operationnel: event.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="Contexte utile pour la tournee du jour."
                        />
                      </label>
                      {!isReliableAddressParts(
                        stopEditForm.adresse,
                        stopEditForm.ville,
                        stopEditForm.code_postal
                      ) ? (
                        <p className="ui-text-muted" style={{ margin: 0, color: "#b45309", fontWeight: 700 }}>
                          Adresse incomplete pour geocodage fiable.
                        </p>
                      ) : null}
                      {stopFormMessage ? <p className="ui-text-muted" style={{ margin: 0 }}>{stopFormMessage}</p> : null}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="tagora-dark-outline-action day-ops-compact-btn"
                          disabled={searchingPosition}
                          onClick={() => void searchPositionFromEditedAddress()}
                        >
                          {searchingPosition ? "Recherche position..." : "Rechercher position"}
                        </button>
                        <button
                          type="button"
                          className="tagora-dark-action day-ops-compact-btn"
                          disabled={savingStop}
                          onClick={() => void saveStopInline()}
                        >
                          {savingStop ? "Enregistrement..." : "Enregistrer"}
                        </button>
                      </div>
                    </AppCard>
                  ) : (
                    <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          Note chauffeur / representant
                        </span>
                        <span>{getFieldString(selected.row, ["note_chauffeur", "note_representant"]) || "-"}</span>
                      </div>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          Commentaire operationnel
                        </span>
                        <span>{getFieldString(selected.row, ["commentaire_operationnel", "commentaire"]) || "-"}</span>
                      </div>
                    </AppCard>
                  )}
                  <details
                    className="tagora-panel-muted"
                    style={{ padding: 12, border: "1px solid #dbe4f0", borderRadius: 12 }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#0f172a",
                        listStyle: "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Documents et preuves</span>
                      <span className="ui-text-muted" style={{ fontSize: 12 }}>Afficher</span>
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <OperationProofsPanel
                        moduleSource={selected.type === "ramassage" ? "ramassage" : "livraison"}
                        sourceId={selected.id}
                        categorieParDefaut={
                          selected.type === "ramassage" ? "preuve_ramassage" : "preuve_livraison"
                        }
                        titre="Documents et preuves"
                        commentairePlaceholder="Ajouter note, document, photo, vocal ou signature"
                        compact
                      />
                    </div>
                  </details>
                </>
              ) : null}
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
