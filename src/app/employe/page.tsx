import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export const metadata: Metadata = {
  title: "Employe",
  description: "Acces employe Tagora.",
};

export default function EmployePage() {
  redirect(hororaNexusLoginRedirectTarget());
}
