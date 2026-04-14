import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../components/site/MarketingShell";
import PageIntro from "../components/site/PageIntro";
import { marketingConnectionLinks } from "../components/site/navigation";

const contactCards = [
  {
    title: "Demande de demo",
    text: "Presentons rapidement la plateforme et les cas d usage les plus utiles pour votre organisation.",
    href: marketingConnectionLinks.demoMailto,
    action: "Demander une demo",
  },
  {
    title: "Contact commercial",
    text: "Parlons de votre contexte, de votre structure et de la meilleure facon de lancer une V1.",
    href: marketingConnectionLinks.contactMailto,
    action: "Ecrire a TAGORA",
  },
  {
    title: "Acces application",
    text: "Si vous avez deja un acces, vous pouvez rejoindre directement l application securisee.",
    href: "/connexion",
    action: "Voir la connexion",
  },
] as const;

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contactez TAGORA pour une demo, une discussion commerciale ou un acces a l application.",
};

export default function Page() {
  return (
    <MarketingShell currentPath="/contact">
      <PageIntro
        eyebrow="Contact"
        title="Parlons de votre contexte."
        description="La V1 du site privilegie un contact simple et rapide. Vous pouvez demander une demo, presenter vos besoins ou acceder a l application si votre compte est deja actif."
      />

      <section className="px-6 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-5">
            {contactCards.map((card, index) => (
              <article
                key={card.title}
                className="rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    0{index + 1}
                  </div>
                </div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  {card.title}
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-600">{card.text}</p>
                <div className="mt-6">
                  <Link
                    href={card.href}
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {card.action}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-[2.2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fe_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-800/80">
              Coordonnees
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Une prise de contact simple, sobre et rapide.
            </h2>
            <div className="mt-8 grid gap-4">
              {[
                ["Courriel", "contact@tagora.ca"],
                ["Application", "app.tagora.ca"],
                ["Site public", "tagora.ca"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {label}
                  </div>
                  <div className="mt-2 text-base font-medium text-slate-900">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
