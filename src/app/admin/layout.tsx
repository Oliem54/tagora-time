import type { Metadata } from "next";
import AuthGate from "@/app/components/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin | TAGORA HORORA",
  },
  description: "Espace administrateur TAGORA HORORA.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate areaRole="admin">{children}</AuthGate>;
}
