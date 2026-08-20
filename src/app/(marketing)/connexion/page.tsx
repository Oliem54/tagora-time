import { redirect } from "next/navigation";

type ConnexionPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(
  raw: Record<string, string | string[] | undefined> | undefined
): string {
  if (!raw) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Ancien hub marketing — alias vers l’accueil applicatif TAGORA Time.
 * Conserve la query string pour les liens existants.
 */
export default async function ConnexionPage({ searchParams }: ConnexionPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  redirect(`/${toQueryString(resolved)}`);
}
