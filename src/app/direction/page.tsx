import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCurrentHororaLoginUrl } from "@/app/lib/auth/horora-login-redirect.server";
import { resolveHororaModuleEntryUrl } from "@/app/lib/auth/horora-local-nexus-fixture";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default async function DirectionPage() {
  redirect(resolveHororaModuleEntryUrl(await resolveCurrentHororaLoginUrl()));
}
