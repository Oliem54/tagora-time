import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Profil employe",
  description: "Profil et securite employe Tagora.",
};

export default function EmployeProfilLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
