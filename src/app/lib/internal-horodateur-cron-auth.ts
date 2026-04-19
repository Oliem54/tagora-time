import type { NextRequest } from "next/server";

/**
 * Autorise les jobs planifiés (GET Vercel Cron ou POST manuel).
 * Accepte Bearer si le jeton correspond à HORODATEUR_REMINDER_SECRET ou CRON_SECRET (Vercel).
 */
export function isHorodateurInternalJobAuthorized(req: NextRequest): boolean {
  const reminder = process.env.HORODATEUR_REMINDER_SECRET?.trim();
  const cron = process.env.CRON_SECRET?.trim();
  const secrets = [reminder, cron].filter(Boolean) as string[];

  if (secrets.length === 0) {
    return false;
  }

  const bearer = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-horodateur-reminder-secret");

  if (bearer?.startsWith("Bearer ")) {
    const token = bearer.slice("Bearer ".length).trim();
    if (secrets.includes(token)) {
      return true;
    }
  }

  if (headerSecret && secrets.includes(headerSecret)) {
    return true;
  }

  return false;
}
