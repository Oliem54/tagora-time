import { redirect } from "next/navigation";
import { resolveCurrentHororaLoginUrl } from "@/app/lib/auth/horora-login-redirect.server";
import { resolveHororaModuleEntryUrl } from "@/app/lib/auth/horora-local-nexus-fixture";

export default async function ConnexionPage() {
  redirect(resolveHororaModuleEntryUrl(await resolveCurrentHororaLoginUrl()));
}
