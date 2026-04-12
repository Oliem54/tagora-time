import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Remorques",
  description: "Gestion des remorques Tagora.",
};

export default function DirectionRessourcesRemorquesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
