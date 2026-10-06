import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default function DirectionPage() {
  redirect(hororaNexusLoginRedirectTarget());
}
