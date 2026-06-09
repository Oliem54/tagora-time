import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Livres de ventes autorisés",
  description:
    "Consultation des livres de ventes autorisés pour la Direction Tagora (vue opérationnelle sans montants).",
};

export default function DirectionCommissionsLayout({ children }: { children: ReactNode }) {
  return children;
}
