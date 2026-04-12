import type { Metadata } from "next";
import AuthGate from "@/app/components/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Employe",
    template: "%s | Employe | Tagora",
  },
  description: "Espace employe Tagora.",
};

export default function EmployeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate areaRole="employe" publicPaths={["/employe", "/employe/login"]}>
      {children}
    </AuthGate>
  );
}
