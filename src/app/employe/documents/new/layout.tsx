import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouveau document",
  description: "Ajout de document Tagora.",
};

export default function EmployeDocumentsNewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
