import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Temps Titan — finance",
  description: "Temps, couts salariaux et refacturation Titan (admin).",
};

export default function AdminTempsTitanFinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
