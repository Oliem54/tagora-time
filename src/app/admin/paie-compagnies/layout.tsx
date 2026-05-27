import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Repartition Oliem / Titan",
  description: "Detail paie et ventilation par compagnie (admin).",
};

export default function AdminPaieCompagniesLayout({ children }: { children: ReactNode }) {
  return children;
}
