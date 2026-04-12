import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terrain direction",
  description: "Suivi terrain direction Tagora.",
};

export default function DirectionTerrainLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
