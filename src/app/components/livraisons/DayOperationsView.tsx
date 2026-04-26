"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HeaderTagora from "@/app/components/HeaderTagora";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import OperationProofsPanel from "@/app/components/proofs/OperationProofsPanel";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

const DayOperationsMap = dynamic(() => import("./DayOperationsMap"), { ssr: false });

type Row = Record<string, string | number | null | undefined>;
type GeocodedPoint = { latitude: number; longitude: number };
type OriginBase = { label: string; latitude: number; longitude: number };
type StopEditForm = {
  adresse: string;
  ville: string;
  code_postal: string;
  province: string;
  latitude: string;
  longitude: string;
  note_chauffeur: string;
  commentaire_operationnel: string;
};

type Props = {
  area: "direction" | "employe";
};

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: GeocodedPoint, b: GeocodedPoint) {
  const earthKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthKm * c;
}

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

function isReliableAddressParts(street: string, city: string, postal: string) {
  return Boolean(street.trim() && city.trim() && postal.trim());
}

function formatSupabaseErrorDetails(
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
  payload: Record<string, unknown>
) {
  if (!error) return "";
  return [
    `message: ${error.message || "-"}`,
    `code: ${error.code || "-"}`,
    `details: ${error.details || "-"}`,
    `hint: ${error.hint || "-"}`,
    `payload: ${JSON.stringify(payload)}`,
  ].join("\n");
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

async function geocodeAddress(address: string): Promise<GeocodedPoint | null> {
  const query = address.trim();
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!data[0]) return null;
    const latitude = Number(data[0].lat);
    const longitude = Number(data[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

export default function DayOperationsView({ area }: Props) {
  const searchParams = useSearchParams();
  const { user, role, loading: accessLoading, hasPermission } = useCurrentAccess();
  const [rows, setRows] = useState<Row[]>([]);
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
  const [showDetail, setShowDetail] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [orderedStopIds, setOrderedStopIds] = useState<number[]>([]);
  const [isEditingStop, setIsEditingStop] = useState(false);
  const [savingStop, setSavingStop] = useState(false);
  const [stopFormMessage, setStopFormMessage] = useState("");
  const [stopEditForm, setStopEditForm] = useState<StopEditForm>({
    adresse: "",
    ville: "",
    code_postal: "",
    province: "",
    latitude: "",
    longitude: "",
    note_chauffeur: "",
    commentaire_operationnel: "",
  });

  const dateIso = searchParams.get("date") || "";
  const canUseLivraisons = hasPermission("livraisons");
  const canManageOrder = area === "direction" && (role === "direction" || role === "admin");
  const canEditStopDetails = role === "direction" || role === "admin";

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
      const { data, error } = await supabase
        .from("livraisons_planifiees")
        .select("*")
        .eq("date_livraison", dateIso)
        .order("ordre_arret", { ascending: true })
        .order("heure_prevue", { ascending: true })
        .order("id", { ascending: true });
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
      if (stops.length === 0) return;
      const nextGeo: Record<number, GeocodedPoint> = {};
      let changed = false;
      for (const stop of stops) {
        if (!Number.isFinite(stop.id)) continue;
        const rowLatitude = parseNumericOrNull(getFieldString(stop.row, ["latitude", "lat"]));
        const rowLongitude = parseNumericOrNull(getFieldString(stop.row, ["longitude", "lng", "lon"]));
        if (rowLatitude != null && rowLongitude != null) {
          nextGeo[stop.id] = { latitude: rowLatitude, longitude: rowLongitude };
          changed = true;
          continue;
        }
        if (!stop.fullAddress) continue;
        const point = await geocodeAddress(stop.fullAddress);
        if (point) {
          nextGeo[stop.id] = point;
          changed = true;
        }
      }
      if (changed) {
        setGeoById((current) => ({ ...current, ...nextGeo }));
      }
    }
    void geocodeStops();
  }, [stops]);

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

  const selected = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const ordered = orderedStopIds
      .map((id) => byId.get(id))
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
    return ordered.find((stop) => stop.id === selectedId) ?? ordered[0] ?? null;
  }, [orderedStopIds, selectedId, stops]);

  useEffect(() => {
    if (!selected) {
      setIsEditingStop(false);
      setStopFormMessage("");
      return;
    }
    setStopEditForm({
      adresse: getFieldString(selected.row, ["adresse", "address", "rue"]),
      ville: getFieldString(selected.row, ["ville", "city"]),
      code_postal: getFieldString(selected.row, ["code_postal", "postal_code", "zip"]),
      province: getFieldString(selected.row, ["province", "state"]),
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

  const routeSummary = useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const orderedStops = orderedStopIds
      .map((id) => byId.get(id))
      .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
    const orderedPoints = orderedStops
      .filter((stop) => geoById[stop.id])
      .map((stop) => ({ id: stop.id, ...geoById[stop.id] }));
    const withOrigin = [
      ...(origin == null ? [] : [{ id: -1, latitude: origin.latitude, longitude: origin.longitude }]),
      ...orderedPoints,
      ...(returnOrigin == null
        ? []
        : [{ id: -2, latitude: returnOrigin.latitude, longitude: returnOrigin.longitude }]),
    ];
    if (orderedPoints.length < 2) {
      return {
        currentKm: 0,
        suggestedKm: 0,
        suggestedOrder: [] as number[],
        currentOrder: [] as number[],
      };
    }
    const distanceForOrder = (points: Array<{ id: number; latitude: number; longitude: number }>) =>
      points.slice(1).reduce((sum, point, index) => sum + haversineKm(points[index], point), 0);

    const currentKm = distanceForOrder(withOrigin);

    const remaining = [...orderedPoints];
    const suggested: Array<{ id: number; latitude: number; longitude: number }> = [];
    let current =
      origin == null
        ? remaining.shift()
        : { id: -1, latitude: origin.latitude, longitude: origin.longitude };
    if (!current) {
      return {
        currentKm: 0,
        suggestedKm: 0,
        suggestedOrder: [] as number[],
        currentOrder: [] as number[],
      };
    }
    if (origin == null) suggested.push(current);
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      remaining.forEach((candidate, idx) => {
        const d = haversineKm(current!, candidate);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      current = remaining.splice(bestIdx, 1)[0];
      suggested.push(current);
    }
    const suggestedKm = distanceForOrder([
      ...(origin == null ? [] : [{ id: -1, latitude: origin.latitude, longitude: origin.longitude }]),
      ...suggested,
      ...(returnOrigin == null
        ? []
        : [{ id: -2, latitude: returnOrigin.latitude, longitude: returnOrigin.longitude }]),
    ]);
    return {
      currentKm,
      suggestedKm,
      suggestedOrder: suggested.map((point) => point.id),
      currentOrder: orderedStops.map((point) => point.id),
    };
  }, [geoById, orderedStopIds, origin, returnOrigin, stops]);

  async function persistManualOrder(ids: number[]) {
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const { error } = await supabase
        .from("livraisons_planifiees")
        .update({ ordre_arret: i + 1 })
        .eq("id", id);
      if (error) {
        setRouteMessage("Erreur de sauvegarde de l'ordre manuel.");
        return false;
      }
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
    setOrderedStopIds(routeSummary.suggestedOrder);
    for (let i = 0; i < routeSummary.suggestedOrder.length; i += 1) {
      const id = routeSummary.suggestedOrder[i];
      const { error } = await supabase
        .from("livraisons_planifiees")
        .update({ ordre_arret: i + 1 })
        .eq("id", id);
      if (error) {
        setRouteMessage("Echec de l'application de l'ordre suggere.");
        setRouteApplying(false);
        return;
      }
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

    setRows((current) =>
      current.map((row) => {
        if (Number(row.id) !== selected.id) return row;
        return { ...row, ...updatedRow };
      })
    );

    const latForMap = parseNumericOrNull(String(updatedRow.latitude ?? ""));
    const lngForMap = parseNumericOrNull(String(updatedRow.longitude ?? ""));
    if (latForMap != null && lngForMap != null) {
      setGeoById((current) => ({
        ...current,
        [selected.id]: { latitude: latForMap, longitude: lngForMap },
      }));
    } else {
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

  return (
    <main className="page-container">
      <HeaderTagora
        title="Journee livraison & ramassage"
        subtitle={dateIso ? formatDateLabel(dateIso) : "Date manquante"}
      />

      <div className="ui-grid-auto" style={{ marginTop: 12 }}>
        <SectionCard title="Operations" subtitle={String(stops.length)} />
        <SectionCard title="Distance actuelle" subtitle={`${routeSummary.currentKm.toFixed(1)} km`} />
        <SectionCard title="Distance suggeree" subtitle={`${routeSummary.suggestedKm.toFixed(1)} km`} />
        <SectionCard
          title="Gain estime"
          subtitle={`${Math.max(0, routeSummary.currentKm - routeSummary.suggestedKm).toFixed(1)} km`}
        />
      </div>

      <div className="day-ops-layout" style={{ marginTop: 12 }}>
        <section
          className="tagora-panel ui-stack-sm"
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Arrets du jour
            </h2>
            <Link
              href={area === "direction" ? "/direction/livraisons" : "/employe/livraisons"}
              className="tagora-dark-outline-action"
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
                  border: "1px solid #16a34a",
                  background: "rgba(240, 253, 244, 0.9)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong>#0 DEPOT OLIEM</strong>
                    <span className="ui-text-muted">Point de depart</span>
                    <span className="ui-text-muted">{origin?.label ?? "Oliem Solutions"}</span>
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
                  className="tagora-dark-outline-action"
                  onClick={() => {
                    setSelectedId(stop.id);
                    setShowDetail(true);
                  }}
                  style={{
                    textAlign: "left",
                    justifyContent: "space-between",
                    borderColor: selected?.id === stop.id ? "#0f2948" : undefined,
                    background: selected?.id === stop.id ? "#f8fafc" : "#fff",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong>
                      #{index + 1} {stop.client}
                    </strong>
                    <span className="ui-text-muted">
                      {stop.type === "ramassage" ? "Ramassage" : "Livraison"} · {stop.time}
                    </span>
                    <span className="ui-text-muted">
                      {stop.fullAddress || stop.address || "Adresse non renseignee"}
                    </span>
                    {!stop.hasReliableAddress ? (
                      <span className="ui-text-muted" style={{ color: "#b45309", fontWeight: 700 }}>
                        Adresse incomplete pour geocodage fiable.
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {stop.isOverdue ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c" }}>RETARD</span>
                    ) : null}
                    <StatusBadge label={stop.statusText} tone={stop.statusTone} />
                  </div>
                </button>
              ))}
              <AppCard
                tone="muted"
                style={{
                  border: "1px solid #b45309",
                  background: "rgba(255, 247, 237, 0.95)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong>#{orderedStopIds.length + 1} RETOUR</strong>
                    <span className="ui-text-muted">Point de retour</span>
                    <span className="ui-text-muted">{returnOrigin?.label ?? origin?.label ?? "Oliem Solutions"}</span>
                  </div>
                  <StatusBadge label="RETOUR" tone="warning" />
                </div>
              </AppCard>
            </>
          )}
        </section>

        <section
          className="ui-stack-md"
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <section
            className="tagora-panel"
            style={{
              padding: 14,
              minWidth: 0,
              boxSizing: "border-box",
              border: "1px solid #d9e4f2",
              boxShadow: "0 8px 20px rgba(15, 41, 72, 0.08)",
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
                className="tagora-dark-outline-action"
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
                className="tagora-dark-outline-action"
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
            <DayOperationsMap
              points={mapPoints}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelectedId(id)}
              origin={origin}
              returnOrigin={returnOrigin}
            />
          </section>

          <section className="tagora-panel ui-stack-sm" style={{ padding: 14, minWidth: 0, boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>
                Suggestion de route
              </h2>
              {canManageOrder ? (
                <button
                  type="button"
                  className="tagora-dark-action"
                  disabled={routeApplying || routeSummary.suggestedOrder.length === 0}
                  onClick={() => void applySuggestedOrder()}
                >
                  {routeApplying ? "Application..." : "Appliquer ordre suggere"}
                </button>
              ) : null}
            </div>
            {routeMessage ? <p className="ui-text-muted" style={{ margin: 0 }}>{routeMessage}</p> : null}
            <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
              <div className="ui-grid-2" style={{ gap: 8 }}>
                <div><strong>Depart:</strong> {origin?.label ?? "Non defini"}</div>
                <div><strong>Retour:</strong> {returnOrigin?.label ?? origin?.label ?? "Non defini"}</div>
                <div><strong>Distance actuelle:</strong> {routeSummary.currentKm.toFixed(1)} km</div>
                <div><strong>Distance suggeree:</strong> {routeSummary.suggestedKm.toFixed(1)} km</div>
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
                  : "-"}
              </div>
              <div>
                <strong>Gain estime:</strong> {Math.max(0, routeSummary.currentKm - routeSummary.suggestedKm).toFixed(1)} km
              </div>
            </AppCard>
          </section>

          {selected ? (
            <section className="tagora-panel ui-stack-xs" style={{ padding: 14, minWidth: 0, boxSizing: "border-box" }}>
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
                  className="tagora-dark-outline-action"
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
                  <div><strong>Dossier:</strong> {selected.dossierId ?? "-"}</div>
                </AppCard>
              </div>

              {showDetail ? (
                <>
                  {canEditStopDetails ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        className="tagora-dark-outline-action"
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
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="tagora-dark-action"
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
                  <AppCard tone="muted" className="ui-stack-xs" style={{ padding: 12 }}>
                    <div className="ui-text-muted" style={{ fontSize: 12 }}>
                      Documents et preuves
                    </div>
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
                  </AppCard>
                </>
              ) : null}
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
