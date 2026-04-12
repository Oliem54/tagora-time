import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouveau dossier",
  description: "Creation de dossier Tagora.",
};

export default function EmployeDossiersNewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
