import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Test Supabase",
  description: "Verification Supabase Tagora.",
};

export default function TestSupabaseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
