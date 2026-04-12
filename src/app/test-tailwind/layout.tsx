import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Test Tailwind",
  description: "Verification Tailwind Tagora.",
};

export default function TestTailwindLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
