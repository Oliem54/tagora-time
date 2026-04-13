import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Bases GPS",
  description: "Configuration des bases GPS de l entreprise.",
};

export default function DirectionGpsBasesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
