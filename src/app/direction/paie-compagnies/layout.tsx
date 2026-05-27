import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Repartition Oliem / Titan",
  description: "Repartition des heures Oliem / Titan Tagora.",
};

export default function DirectionPaieCompagniesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
