import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Livres autorises",
  description: "Livres de ventes autorises pour la Direction Tagora (vue operationnelle sans montants).",
};

export default function DirectionCommissionsLayout({ children }: { children: ReactNode }) {
  return children;
}
