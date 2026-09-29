import { redirect } from "next/navigation";
import { readHororaNexusLoginUrl } from "@/app/lib/auth/horora-nexus-login.server";

export default async function ConnexionPage() {
  redirect(await readHororaNexusLoginUrl());
}
