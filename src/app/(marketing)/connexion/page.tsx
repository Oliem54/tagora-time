import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  redirect(await readHororaNexusLoginUrl());
}
