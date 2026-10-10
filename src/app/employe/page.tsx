import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";
import { resolveHororaModuleEntryUrl } from "@/app/lib/auth/horora-local-nexus-fixture";

export const metadata: Metadata = {
  title: "Employe",
  description: "Acces employe Tagora.",
};

export default function EmployePage() {
  redirect(resolveHororaModuleEntryUrl(NEXUS_PUBLIC_LOGIN_URL));
}
