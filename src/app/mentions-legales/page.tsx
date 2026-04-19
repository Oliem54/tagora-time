import type { Metadata } from "next";
import MarketingShell from "@/app/(marketing)/components/site/MarketingShell";

export const metadata: Metadata = {
  title: "Mentions legales",
  description: "Mentions legales du site Tagora.",
};

export default function MentionsLegalesPage() {
  return (
    <MarketingShell currentPath="/mentions-legales">
      <article className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Mentions legales
        </h1>
        <p className="mt-6 text-sm leading-7 text-slate-600">
          Ce contenu est un canevas a completer avec votre raison sociale, siege, directeur de
          publication, hebergeur, numero SIREN/SIRET ou equivalent, et coordonnees de contact
          conformement a la reglementation applicable.
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Fait valider cette page par votre conseil avant toute mise en production.
        </p>
      </article>
    </MarketingShell>
  );
}
