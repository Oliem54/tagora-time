import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Livre de commissions",
  description: "Livre de commissions — admin finance.",
};

export default function AdminCompensationLayout({ children }: { children: ReactNode }) {
  return children;
}
