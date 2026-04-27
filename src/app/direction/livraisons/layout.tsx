import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Livraison & ramassage direction",
  description: "Suivi des livraisons et ramassages direction Tagora.",
};

export default function DirectionLivraisonsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
