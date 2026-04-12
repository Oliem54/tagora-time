import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouveau dossier terrain",
  description: "Creation d un dossier terrain Tagora.",
};

export default function DirectionTerrainNewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
