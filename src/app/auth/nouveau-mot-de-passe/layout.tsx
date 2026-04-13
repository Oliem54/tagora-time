import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Mise a jour du mot de passe Tagora Time.",
};

export default function NewPasswordLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
