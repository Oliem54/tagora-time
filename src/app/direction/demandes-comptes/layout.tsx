import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Demandes de comptes · Gestion des accès",
  description:
    "Gérez les demandes de comptes, les accès portail et les liaisons avec les fiches employés.",
};

export default function DirectionDemandesComptesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
