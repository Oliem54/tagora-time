import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Vehicules",
  description: "Gestion des vehicules Tagora.",
};

export default function DirectionRessourcesVehiculesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
