import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ameliorations",
  description: "Les suggestions d’amélioration seront bientôt centralisées dans Nexus.",
};

export default function AmeliorationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
