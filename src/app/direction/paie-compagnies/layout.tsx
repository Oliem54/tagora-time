import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Paie par compagnie",
  description: "Paie par compagnie Tagora.",
};

export default function DirectionPaieCompagniesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
