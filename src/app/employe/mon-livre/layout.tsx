import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Mon livre de ventes",
  description: "Vos objectifs et commissions personnelles, en lecture seule.",
};

export default function EmployeMonLivreLayout({ children }: { children: ReactNode }) {
  return children;
}
