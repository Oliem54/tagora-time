import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Compensation",
  description: "Compensation Engine — consultation et validation finance.",
};

export default function AdminCompensationLayout({ children }: { children: ReactNode }) {
  return children;
}
