import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Connexion direction",
  description: "Connexion a l espace direction Tagora.",
};

export default function DirectionLoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
