import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Remuneration",
  description: "Remuneration, taux et donnees confidentielles employes (admin).",
};

export default function AdminRemunerationLayout({ children }: { children: ReactNode }) {
  return children;
}
