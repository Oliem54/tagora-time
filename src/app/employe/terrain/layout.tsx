import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terrain employe",
  description: "Terrain employe Tagora.",
};

export default function EmployeTerrainLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
