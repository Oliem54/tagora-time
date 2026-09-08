import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./employe-dashboard.css";

export const metadata: Metadata = {
  title: "Tableau de bord employé",
  description: "Tableau de bord employé TAGORA HORORA.",
};

export default function EmployeDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
