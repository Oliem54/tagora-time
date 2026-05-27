import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Finance & remuneration",
  description: "Finance, remuneration, taux et donnees financieres reservees a l administration.",
};

export default function AdminRemunerationLayout({ children }: { children: ReactNode }) {
  return children;
}
