import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default async function DirectionPage() {
  redirect(await readHororaNexusLoginUrl());
}
