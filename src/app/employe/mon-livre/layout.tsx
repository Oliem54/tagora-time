import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Mon livre de ventes",
  description: "Suivi personnel de vos objectifs et commissions.",
};

export default function EmployeMonLivreLayout({ children }: { children: ReactNode }) {
  return children;
}
