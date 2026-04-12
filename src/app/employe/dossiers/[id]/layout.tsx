import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dossier",
  description: "Consultation de dossier Tagora.",
};

export default function EmployeDossierDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
