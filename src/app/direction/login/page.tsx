import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export const metadata: Metadata = {
  title: "Connexion direction",
  description: "La connexion direction HORORA passe par TAGORA Nexus.",
};

export default function DirectionLoginPage() {
  redirect(hororaNexusLoginRedirectTarget());
}
