import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Refacturation intercompagnies",
  description: "Refacturation intercompagnies Oliem / Titan et montants salariaux (admin).",
};

export default function AdminFacturationTitanLayout({ children }: { children: ReactNode }) {
  return children;
}
