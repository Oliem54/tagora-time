import { getOperationCoordinates } from "@/app/lib/livraisons/coordinates";

type Row = Record<string, string | number | null | undefined>;

function fieldString(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function getPickupPhone(row: Row): string | null {
  const keys = [
    "client_phone",
    "contact_phone_primary",
    "contact_phone_secondary",
    "telephone",
    "telephone_client",
  ];
  for (const key of keys) {
    const raw = fieldString(row, [key]);
    if (!raw) continue;
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.length >= 7) return raw;
  }
  return null;
}

export function buildPickupAddress(row: Row, defaultAddress: string): string {
  const parts = [
    fieldString(row, ["adresse", "address", "rue"]),
    fieldString(row, ["ville", "city"]),
    fieldString(row, ["code_postal", "postal_code"]),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return defaultAddress;
}

export function buildPickupMapsUrl(row: Row, address: string): string | null {
  const coords = getOperationCoordinates(row);
  if (coords.lat != null && coords.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
  }
  const query = encodeURIComponent(address.trim());
  if (!query) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}
