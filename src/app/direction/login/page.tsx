import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const metadata: Metadata = {
  title: "Connexion direction",
  description: "La connexion direction HORORA passe par TAGORA Nexus.",
};

export default async function DirectionLoginPage() {
  redirect(await readHororaNexusLoginUrl());
}
