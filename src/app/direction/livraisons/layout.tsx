import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Livraisons direction",
  description: "Suivi des livraisons direction Tagora.",
};

export default function DirectionLivraisonsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
