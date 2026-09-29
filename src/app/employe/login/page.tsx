import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion employé",
  description: "La connexion employé HORORA passe par TAGORA Nexus.",
};

export default async function EmployeeLoginPage() {
  redirect(await readHororaNexusLoginUrl());
}
