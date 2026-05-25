import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Commissions & objectifs",
  description: "Objectifs de vente et commissions (admin, donnees monetaires).",
};

export default function AdminCommissionsLayout({ children }: { children: ReactNode }) {
  return children;
}
