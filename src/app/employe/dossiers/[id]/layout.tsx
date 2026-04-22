import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Intervention",
  description: "Consultation d intervention Tagora.",
};

export default function EmployeDossierDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
