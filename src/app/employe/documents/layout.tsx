import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Documents employe",
  description: "Documents employe Tagora.",
};

export default function EmployeDocumentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
