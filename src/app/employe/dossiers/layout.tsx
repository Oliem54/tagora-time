import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dossiers employe",
  description: "Dossiers employe Tagora.",
};

export default function EmployeDossiersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
