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
};

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
}: Props) {
  const routePath = [
    ...[...points]
      .sort((a, b) => a.order - b.order)
      .map((point) => [point.latitude, point.longitude] as [number, number]),
  ];

  const center = (
    points[0]
      ? [points[0].latitude, points[0].longitude]
      : origin
        ? [origin.latitude, origin.longitude]
        : returnOrigin
          ? [returnOrigin.latitude, returnOrigin.longitude]
          : [46.8139, -71.2082]
  ) as [number, number];
  const bounds = points.map((point) => [point.latitude, point.longitude]) as [
    number,
    number
  ][];
  if (origin) {
    bounds.push([origin.latitude, origin.longitude]);
    routePath.unshift([origin.latitude, origin.longitude]);
  }
  if (returnOrigin) {
    bounds.push([returnOrigin.latitude, returnOrigin.longitude]);
    routePath.push([returnOrigin.latitude, returnOrigin.longitude]);
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
      {points.map((point) => (
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
      {routePath.length > 1 ? (
        <Polyline positions={routePath} pathOptions={{ color: "#0f2948", weight: 3, opacity: 0.65 }} />
      ) : null}
      {points.length === 0 ? (
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
