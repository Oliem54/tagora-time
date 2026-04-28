"use client";

import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

export type DayOperationMapPoint = {
  id: number;
  order: number;
  label: string;
  type: "livraison" | "ramassage";
  latitude: number;
  longitude: number;
};

type OriginPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

type Props = {
  points: DayOperationMapPoint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  origin: OriginPoint | null;
  returnOrigin: OriginPoint | null;
  routeGeometryLatLng?: Array<[number, number]>;
};

function isValidMapCoord(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function EnsureLeafletResize() {
  const map = useMap();

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      map.invalidateSize();
    };
    const raf = requestAnimationFrame(tick);
    const t1 = window.setTimeout(tick, 120);
    const t2 = window.setTimeout(tick, 400);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);

  return null;
}

function buildNumberedIcon(order: number, type: "livraison" | "ramassage", active: boolean) {
  const background = type === "ramassage" ? "#0f2948" : "#2563eb";
  const ring = active ? "#f59e0b" : "#ffffff";
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:999px;background:${background};color:#fff;border:2px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,0.25)">${order}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function DayOperationsMap({
  points,
  selectedId,
  onSelect,
  origin,
  returnOrigin,
  routeGeometryLatLng = [],
}: Props) {
  const displayPoints = (() => {
    const grouped = new Map<string, DayOperationMapPoint[]>();
    points.forEach((point) => {
      const key = `${point.latitude.toFixed(6)}|${point.longitude.toFixed(6)}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(point);
      grouped.set(key, bucket);
    });
    const next: DayOperationMapPoint[] = [];
    grouped.forEach((bucket) => {
      if (bucket.length === 1) {
        next.push(bucket[0]);
        return;
      }
      // Spread overlapping markers in a tiny circle so all stops remain visible.
      const radius = 0.00022;
      bucket.forEach((point, idx) => {
        const angle = (2 * Math.PI * idx) / bucket.length;
        next.push({
          ...point,
          latitude: point.latitude + Math.sin(angle) * radius,
          longitude: point.longitude + Math.cos(angle) * radius,
        });
      });
    });
    return next;
  })();

  /** Tracé = ordre exact de `points` (mapPoints / liste). Ne pas trier ici. */
  const stopPositions = points
    .map((point) => [point.latitude, point.longitude] as [number, number])
    .filter(([lat, lng]) => isValidMapCoord(lat, lng));

  const routePath: [number, number][] = [];
  if (origin && isValidMapCoord(origin.latitude, origin.longitude)) {
    routePath.push([origin.latitude, origin.longitude]);
  }
  routePath.push(...stopPositions);
  if (returnOrigin && isValidMapCoord(returnOrigin.latitude, returnOrigin.longitude)) {
    routePath.push([returnOrigin.latitude, returnOrigin.longitude]);
  }

  const center = (
    displayPoints[0] && isValidMapCoord(displayPoints[0].latitude, displayPoints[0].longitude)
      ? ([displayPoints[0].latitude, displayPoints[0].longitude] as [number, number])
      : stopPositions[0]
        ? stopPositions[0]
        : origin && isValidMapCoord(origin.latitude, origin.longitude)
          ? ([origin.latitude, origin.longitude] as [number, number])
          : returnOrigin && isValidMapCoord(returnOrigin.latitude, returnOrigin.longitude)
            ? ([returnOrigin.latitude, returnOrigin.longitude] as [number, number])
            : ([46.8139, -71.2082] as [number, number])
  ) as [number, number];

  const bounds: [number, number][] = displayPoints
    .filter((p) => isValidMapCoord(p.latitude, p.longitude))
    .map((p) => [p.latitude, p.longitude]);
  if (origin && isValidMapCoord(origin.latitude, origin.longitude)) {
    bounds.push([origin.latitude, origin.longitude]);
  }
  if (returnOrigin && isValidMapCoord(returnOrigin.latitude, returnOrigin.longitude)) {
    bounds.push([returnOrigin.latitude, returnOrigin.longitude]);
  }
  const boundsOrUndefined = bounds.length > 0 ? bounds : undefined;

  return (
    <MapContainer
      className="day-ops-leaflet-map"
      center={center}
      zoom={11}
      style={{
        height: 500,
        width: "100%",
        maxWidth: "100%",
        display: "block",
        borderRadius: 14,
        overflow: "hidden",
      }}
      bounds={boundsOrUndefined}
      scrollWheelZoom
    >
      <EnsureLeafletResize />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {origin ? (
        <Marker
          position={[origin.latitude, origin.longitude]}
          icon={L.divIcon({
            className: "",
            html: `<div style="width:28px;height:28px;border-radius:999px;background:#16a34a;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">DEP</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            {origin.label}
          </Tooltip>
        </Marker>
      ) : null}
      {returnOrigin ? (
        <Marker
          position={[returnOrigin.latitude, returnOrigin.longitude]}
          icon={L.divIcon({
            className: "",
            html: `<div style="width:28px;height:28px;border-radius:999px;background:#b45309;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">RET</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            {returnOrigin.label}
          </Tooltip>
        </Marker>
      ) : null}
      {displayPoints
        .filter((point) => isValidMapCoord(point.latitude, point.longitude))
        .map((point) => (
        <Marker
          key={point.id}
          position={[point.latitude, point.longitude]}
          icon={buildNumberedIcon(point.order, point.type, selectedId === point.id)}
          eventHandlers={{
            click: () => onSelect(point.id),
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent={selectedId === point.id}>
            {point.label}
          </Tooltip>
          <Popup>
            <div style={{ display: "grid", gap: 4 }}>
              <strong>{point.label}</strong>
              <span>Ordre: {point.order}</span>
              <span>Type: {point.type === "ramassage" ? "Ramassage" : "Livraison"}</span>
            </div>
          </Popup>
        </Marker>
      ))}
      {(routeGeometryLatLng.length > 1 || routePath.length > 1) ? (
        <Polyline
          positions={routeGeometryLatLng.length > 1 ? routeGeometryLatLng : routePath}
          pathOptions={{ color: "#0f2948", weight: 3, opacity: 0.65 }}
        />
      ) : null}
      {displayPoints.length === 0 ? (
        <Marker position={center}>
          <Popup>
            <div style={{ fontSize: 13 }}>
              Aucun point geolocalisable pour cette journee.
            </div>
          </Popup>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
