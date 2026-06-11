import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Comptes employés · Registre global",
  description:
    "Registre global des accès portail, fiches employés et diagnostics de cohérence.",
};

export default function DirectionComptesEmployesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
