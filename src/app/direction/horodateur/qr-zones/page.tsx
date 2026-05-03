import type { Metadata } from "next";
import DirectionHorodateurQrZonesClient from "./DirectionHorodateurQrZonesClient";

export const metadata: Metadata = {
  title: "Zones punch QR",
  description: "Gestion des zones de pointage QR.",
};

export default function DirectionHorodateurQrZonesPage() {
  return <DirectionHorodateurQrZonesClient />;
}
