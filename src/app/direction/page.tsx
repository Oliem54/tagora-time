import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default function DirectionPage() {
  redirect(NEXUS_PUBLIC_LOGIN_URL);
}
