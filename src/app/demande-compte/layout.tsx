import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Demande de compte",
  description: "Formulaire de demande d acces Tagora.",
};

export default function DemandeCompteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
