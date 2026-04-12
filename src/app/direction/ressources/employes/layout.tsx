import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Employes",
  description: "Gestion des employes Tagora.",
};

export default function DirectionRessourcesEmployesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
