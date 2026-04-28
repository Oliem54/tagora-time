import type { Metadata } from "next";
import AuthGate from "@/app/components/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin | Tagora",
  },
  description: "Espace administrateur Tagora.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate areaRole="admin">{children}</AuthGate>;
}
