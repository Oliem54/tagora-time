import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Tableau de bord employe",
  description: "Tableau de bord employe Tagora.",
};

export default function EmployeDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
