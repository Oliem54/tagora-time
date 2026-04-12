import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Documents direction",
  description: "Documents direction Tagora.",
};

export default function DirectionDocumentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
