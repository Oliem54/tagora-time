import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Paie direction",
  description: "Paie direction Tagora.",
};

export default function DirectionPaieLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
