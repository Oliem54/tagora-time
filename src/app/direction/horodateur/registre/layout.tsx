import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Registre des heures",
  description: "Consultation historique des heures horodateur — direction Tagora.",
};

export default function HorodateurRegistreLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
