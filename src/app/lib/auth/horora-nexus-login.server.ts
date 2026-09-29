import { headers } from "next/headers";
import { resolveHororaNexusLoginUrl } from "@/app/lib/auth/nexus-handoff-config";

/** Destination Nexus du hôte HTTP courant. Production reste sur app.tagora.ca. */
export async function readHororaNexusLoginUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return resolveHororaNexusLoginUrl(host);
}
