import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { resolveHororaModuleEntryUrl } from "@/app/lib/auth/horora-local-nexus-fixture";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default function DirectionPage() {
  redirect(resolveHororaModuleEntryUrl(NEXUS_PUBLIC_LOGIN_URL));
}
