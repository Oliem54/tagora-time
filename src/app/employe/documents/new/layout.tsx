import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouvelle intervention",
  description: "Ajout d intervention Tagora.",
};

export default function EmployeDocumentsNewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
