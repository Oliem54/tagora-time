import Link from "next/link";
import {
  publicNexusCallbackDenyReason,
  resolveNexusPortalReturnUrl,
  type NexusCallbackPublicDenyReason,
} from "@/app/lib/auth/nexus-handoff-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COPY: Record<NexusCallbackPublicDenyReason, { title: string; body: string }> = {
  membership_missing: {
    title: "Accès HORORA refusé",
    body: "Aucune membership HORORA active n’est liée à ce compte Nexus.",
  },
  membership_ambiguous: {
    title: "Accès HORORA refusé",
    body: "Plusieurs memberships HORORA actives rendent le rôle ambigu. Aucun rôle employé n’est choisi par défaut.",
  },
  role_mapping_denied: {
    title: "Accès HORORA refusé",
    body: "Le rôle d’organisation HORORA n’est pas reconnu. Nexus ne choisit pas un rôle employé par défaut.",
  },
  handoff_expired: {
    title: "Handoff Nexus expiré",
    body: "Le lancement signé a expiré. Relancez HORORA depuis Nexus.",
  },
  replay: {
    title: "Handoff Nexus déjà utilisé",
    body: "Ce lancement à usage unique a déjà été consommé. Relancez HORORA depuis Nexus.",
  },
  cross_tenant: {
    title: "Accès HORORA refusé",
    body: "L’organisation du handoff Nexus ne correspond pas à la membership HORORA.",
  },
  handoff_missing: {
    title: "Handoff Nexus manquant",
    body: "HORORA n’a pas reçu de handoff Nexus signé. Ouvrez le module depuis Nexus.",
  },
  handoff_refused: {
    title: "Handoff Nexus refusé",
    body: "Le lancement Nexus n’a pas pu ouvrir une session HORORA. Aucun mot de passe HORORA n’est demandé.",
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readReason(
  raw: Record<string, string | string[] | undefined> | undefined
): NexusCallbackPublicDenyReason {
  const value = raw?.reason;
  const reason = Array.isArray(value) ? value[0] : value;
  return publicNexusCallbackDenyReason(reason);
}

export default async function NexusHandoffDeniedPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const reason = readReason(resolved);
  const copy = COPY[reason];
  const portal = resolveNexusPortalReturnUrl();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-neutral-500">HORORA</p>
      <h1 className="text-2xl font-semibold text-neutral-950">{copy.title}</h1>
      <p className="text-base text-neutral-700">{copy.body}</p>
      <p className="text-sm text-neutral-500">Code : {reason}</p>
      {portal.ok ? (
        <Link
          href={portal.url}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#008247] px-4 text-sm font-medium text-white"
        >
          Retour à Nexus
        </Link>
      ) : (
        <p className="text-sm text-neutral-600">
          Relancez HORORA depuis le portail Nexus. Le login mot de passe HORORA n’est pas utilisé
          après un handoff Nexus.
        </p>
      )}
    </main>
  );
}
