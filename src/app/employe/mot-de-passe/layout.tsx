import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Changer le mot de passe",
  description: "Modification du mot de passe employe Tagora.",
};

export default function EmployeMotDePasseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
