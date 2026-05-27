import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Suivi des heures",
  description: "Suivi des heures par compagnie Tagora.",
};

export default function DirectionTempsTitanLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
