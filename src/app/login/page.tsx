import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
  description: "La connexion HORORA passe par TAGORA Nexus.",
};

export default async function LoginPage() {
  redirect(await readHororaNexusLoginUrl());
}
