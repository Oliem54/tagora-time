import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sorties terrain",
  description: "Suivi des sorties terrain Tagora.",
};

export default function DirectionSortiesTerrainLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
