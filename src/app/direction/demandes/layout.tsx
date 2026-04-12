import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Demandes",
  description: "Demandes internes Tagora.",
};

export default function DirectionDemandesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
