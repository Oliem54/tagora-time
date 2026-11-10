import { headers } from "next/headers";
import {
  hororaLoginLocationForDecision,
  resolveHororaNexusLoginTarget,
} from "@/app/lib/canonical-domains";

export async function resolveCurrentHororaLoginUrl(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  return hororaLoginLocationForDecision(
    resolveHororaNexusLoginTarget({
      hostname: host,
      vercelEnv: process.env.VERCEL_ENV,
      vercelProjectId: process.env.VERCEL_PROJECT_ID,
    })
  );
}
