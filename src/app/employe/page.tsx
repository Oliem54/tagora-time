import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const metadata: Metadata = {
  title: "Employe",
  description: "Acces employe Tagora.",
};

export default async function EmployePage() {
  redirect(await readHororaNexusLoginUrl());
}
