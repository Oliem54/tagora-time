import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Horodateur employe",
  description: "Horodateur employe Tagora.",
};

export default function EmployeHorodateurLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
