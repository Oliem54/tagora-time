import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCurrentHororaLoginUrl } from "@/app/lib/auth/horora-login-redirect.server";
import { resolveHororaModuleEntryUrl } from "@/app/lib/auth/horora-local-nexus-fixture";

export const metadata: Metadata = {
  title: "Connexion direction",
  description: "La connexion direction HORORA passe par TAGORA Nexus.",
};

export default async function DirectionLoginPage() {
  redirect(resolveHororaModuleEntryUrl(await resolveCurrentHororaLoginUrl()));
}
