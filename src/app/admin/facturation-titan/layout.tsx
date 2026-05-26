import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Facturation Titan",
  description: "Facturation Titan et montants salariaux (admin).",
};

export default function AdminFacturationTitanLayout({ children }: { children: ReactNode }) {
  return children;
}
