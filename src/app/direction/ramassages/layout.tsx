import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../livraison-ramassage-ui.css";

export const metadata: Metadata = {
  title: "Ramassages direction",
  description: "Suivi des ramassages direction Tagora.",
};

export default function DirectionRamassagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
