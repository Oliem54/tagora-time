import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Journal des heures et couts",
  description: "Heures, couts salariaux et refacturation intercompagnies Oliem / Titan (admin).",
};

export default function AdminTempsTitanFinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
