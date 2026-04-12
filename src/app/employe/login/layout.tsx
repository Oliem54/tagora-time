import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Connexion employe",
  description: "Connexion a l espace employe Tagora.",
};

export default function EmployeLoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
