import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gestion des comptes employe",
  description: "Gestion des comptes employe Tagora.",
};

export default function DirectionDemandesComptesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
