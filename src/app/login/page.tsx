import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export const metadata: Metadata = {
  title: "Connexion",
  description: "La connexion HORORA passe par TAGORA Nexus.",
};

export default function LoginPage() {
  redirect(hororaNexusLoginRedirectTarget());
}
