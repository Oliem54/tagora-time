import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../components/site/MarketingShell";
import PageIntro from "../components/site/PageIntro";
import { marketingConnectionLinks } from "../components/site/navigation";

const benefits = [
  "Mises a jour plus rapides",
  "Moins d erreurs d affichage",
  "Image magasin plus nette",
  "Base plus evolutive pour vos prix",
] as const;

const blocks = [
  {
    title: "Diffusion plus simple",
    text: "Une meme logique peut soutenir les changements de prix, les zones et les priorites magasin.",
  },
  {
    title: "Execution plus propre",
    text: "Les interventions manuelles diminuent et l affichage reste plus coherent d une zone a l autre.",
  },
  {
    title: "Complement naturel du logiciel",
    text: "Le pilotage operationnel et l affichage commercial suivent une meme direction produit.",
  },
] as const;

export const metadata: Metadata = {
  title: "Etiquettes",
  description:
    "TAGORA Etiquettes electroniques automatise l affichage des prix en magasin avec une approche claire, moderne et evolutive.",
};

export default function Page() {
  return (
    <MarketingShell currentPath="/etiquettes">
      <PageIntro
        eyebrow="TAGORA Etiquettes electroniques"
        title="Des prix plus synchronises. Un magasin plus net."
        description="TAGORA complete la structure logicielle avec une couche etiquettes electroniques qui simplifie l affichage, reduit les interventions manuelles et donne une image plus moderne au commerce."
        actions={
          <>
            <Link
              href={marketingConnectionLinks.demoMailto}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(255,255,255,0.16)] transition hover:bg-slate-100"
            >
              Demander une demo
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
            >
              Nous contacter
            </Link>
          </>
        }
      />

      <section className="px-6 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[2.2rem] border border-slate-200/70 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-800/80">
              Valeur terrain + magasin
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Une couche visible qui renforce la rigueur operationnelle.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              L affichage des prix devient plus stable, plus lisible et plus simple a faire evoluer. Le resultat est plus propre pour l equipe comme pour le commerce.
            </p>
            <div className="mt-8 grid gap-3">
              {benefits.map((benefit, index) => (
                <div
                  key={benefit}
                  className="flex items-center gap-4 rounded-[1.25rem] bg-slate-50 px-4 py-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] text-sm font-semibold text-white">
                    0{index + 1}
                  </div>
                  <p className="text-sm font-medium text-slate-700">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="rounded-[1.9rem] bg-[linear-gradient(180deg,#071629_0%,#0d2242_100%)] p-6 text-white">
              <div className="mb-4 flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/6 px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-sky-200/72">
                    Etiquettes connectees
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    Mise a jour uniforme des rayons
                  </div>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  Retail
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1.3rem] border border-white/10 bg-white/7 p-4"
                  >
                    <div className="rounded-[1rem] border border-sky-200/30 bg-[linear-gradient(180deg,#ffffff_0%,#e0f2fe_100%)] px-4 py-4 shadow-[0_12px_30px_rgba(14,165,233,0.12)]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-900/60">
                            Rayon {item}
                          </div>
                          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                            12,99 $
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            Produit synchronise
                          </div>
                        </div>
                        <div className="rounded-full bg-slate-950 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white">
                          Actif
                        </div>
                      </div>
                      <div className="mt-5 h-8 rounded-lg bg-[linear-gradient(90deg,#0f172a_0%,#3b82f6_65%,#38bdf8_100%)] opacity-90" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-8 lg:px-8 lg:py-14">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {blocks.map((block, index) => (
            <article
              key={block.title}
              className="rounded-[1.9rem] border border-slate-200/70 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  0{index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold text-slate-950">{block.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{block.text}</p>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
