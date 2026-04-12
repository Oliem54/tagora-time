import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Facturation Titan",
  description: "Facturation Titan Tagora.",
};

export default function DirectionFacturationTitanLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
