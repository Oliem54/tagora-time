import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildLoginStandardRedirectPath } from "@/app/lib/canonical-domains";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Point d entree connexion standard TAGORA Time.",
};

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toURLSearchParams(
  raw: Record<string, string | string[] | undefined> | undefined
): URLSearchParams {
  const params = new URLSearchParams();
  if (!raw) return params;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    }
  }
  return params;
}

/**
 * DEC-015 LOGIN_STANDARD=/login — alias contrôlé vers `/connexion`.
 * Conserve `/employe/login`, `/direction/login` et `/connexion` inchangés.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  redirect(buildLoginStandardRedirectPath(toURLSearchParams(resolved)));
}
