import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Commissions & objectifs",
  description: "Objectifs de vente et suivi des commissions direction Tagora.",
};

export default function DirectionCommissionsLayout({ children }: { children: ReactNode }) {
  return children;
}
