import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ressources direction",
  description: "Ressources internes direction Tagora.",
};

export default function DirectionRessourcesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
