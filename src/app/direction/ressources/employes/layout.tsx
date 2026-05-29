import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Gestion des comptes employés",
  description:
    "Gérez les fiches employés, les accès portail, les statuts actifs ou archivés et les liaisons avec les demandes de comptes.",
};

export default function DirectionRessourcesEmployesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
