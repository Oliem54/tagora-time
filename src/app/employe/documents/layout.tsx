import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Interventions employe",
  description: "Interventions employe Tagora.",
};

export default function EmployeDocumentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
