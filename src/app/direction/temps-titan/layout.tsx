import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Temps Titan",
  description: "Suivi des temps Titan Tagora.",
};

export default function DirectionTempsTitanLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
