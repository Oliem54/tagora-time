export const DELIVERY_TRACKING_REFRESH_MS = 8000;

export function generateDeliveryTrackingToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildDeliveryTrackingUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/suivi/${token}` : `/suivi/${token}`;
}

export function getDeliveryTrackingMapUrl(
  latitude: number | null | undefined,
  longitude: number | null | undefined
) {
  if (
    typeof latitude !== "number" ||
    Number.isNaN(latitude) ||
    typeof longitude !== "number" ||
    Number.isNaN(longitude)
  ) {
    return null;
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}&z=13&output=embed`;
}

export function getDeliveryStatusLabel(status: string | null | undefined) {
  if (status === "en_cours") return "En cours";
  if (status === "livree") return "Livree";
  if (status === "probleme") return "Probleme";
  if (status === "arrive") return "Arrive";
  return "Planifiee";
}
