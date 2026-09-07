import type { Metadata } from "next";
import AuthGate from "@/app/components/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Employé",
    template: "%s | Employé | TAGORA HORORA",
  },
  description: "Espace employé TAGORA HORORA.",
};

export default function EmployeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate
      areaRole="employe"
      publicPaths={["/employe", "/employe/login"]}
      wrongRoleRenderPaths={["/employe/mon-livre"]}
    >
      {children}
    </AuthGate>
  );
}
