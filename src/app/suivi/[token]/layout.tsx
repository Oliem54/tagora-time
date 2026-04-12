import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Suivi de livraison",
  description: "Suivi de livraison Tagora.",
};

export default function SuiviLivraisonLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
