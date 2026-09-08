import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export const metadata: Metadata = {
  title: "Employe",
  description: "Acces employe Tagora.",
};

export default function EmployePage() {
  redirect(NEXUS_PUBLIC_LOGIN_URL);
}
