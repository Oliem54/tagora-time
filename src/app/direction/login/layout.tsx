import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Connexion direction",
  description: "Connexion à l’espace direction TAGORA HORORA.",
};

export default function DirectionLoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
