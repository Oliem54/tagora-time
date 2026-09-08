import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export const metadata: Metadata = {
  title: "Connexion employé",
  description: "La connexion employé HORORA passe par TAGORA Nexus.",
};

export default function EmployeeLoginPage() {
  redirect(NEXUS_PUBLIC_LOGIN_URL);
}
