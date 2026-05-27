import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Paie",
  description: "Paie et synthese des heures par compagnie (admin, donnees financieres reservees a l administration).",
};

export default function AdminPaieLayout({ children }: { children: ReactNode }) {
  return children;
}
