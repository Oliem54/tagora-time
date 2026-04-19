import type { Metadata } from "next";
import MarketingShell from "@/app/(marketing)/components/site/MarketingShell";

export const metadata: Metadata = {
  title: "Confidentialite",
  description: "Politique de confidentialite et traitement des donnees personnelles.",
};

export default function ConfidentialitePage() {
  return (
    <MarketingShell currentPath="/confidentialite">
      <article className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Politique de confidentialite
        </h1>
        <p className="mt-6 text-sm leading-7 text-slate-600">
          Cette application peut traiter des donnees personnelles (compte employe, horaires,
          localisation professionnelle, numeros de telephone pour les SMS, etc.). Ce texte est un
          canevas : documentez les finalites, bases legales, durees de conservation, destinataires,
          transferts hors UE le cas echeant, et les droits des personnes (acces, rectification,
          opposition, etc.).
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Adaptez-le a votre structure et faites-le valider juridiquement avant diffusion.
        </p>
      </article>
    </MarketingShell>
  );
}
