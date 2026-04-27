import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nouvelle intervention",
  description: "Creation d intervention Tagora.",
};

export default function EmployeDossiersNewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
