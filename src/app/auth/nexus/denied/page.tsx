import Link from "next/link";
import TimePublicShell from "@/app/components/time-public/TimePublicShell";
import HororaStateBanner from "@/app/components/horora/HororaStateBanner";
import {
  publicNexusCallbackDenyReason,
  resolveNexusDeniedReturnUrl,
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
  mapping_unavailable: {
    title: "Liaison Nexus → HORORA indisponible",
    body: "HORORA n’a pas pu résoudre la liaison Nexus avec la base staging. Relancez depuis Nexus ou contactez l’administrateur.",
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
  const returnUrl = resolveNexusDeniedReturnUrl();

  return (
    <TimePublicShell brandSize="login" compact showWordmark={false}>
      <HororaStateBanner tone="danger" headingLevel={1} title={copy.title}>
        <p>{copy.body}</p>
        <p>Code : {reason}</p>
      </HororaStateBanner>
      <p className="time-public-back">
        <Link href={returnUrl} className="horora-nexus-return">
          Retour à Nexus
        </Link>
      </p>
    </TimePublicShell>
  );
}
