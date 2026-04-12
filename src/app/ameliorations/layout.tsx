import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ameliorations",
  description: "Suggestions et ameliorations Tagora.",
};

export default function AmeliorationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
