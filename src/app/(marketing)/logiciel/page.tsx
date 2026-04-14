import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../components/site/MarketingShell";
import PageIntro from "../components/site/PageIntro";
import { marketingConnectionLinks } from "../components/site/navigation";

const modules = [
  {
    title: "Gestion terrain",
    text: "Coordonnez les equipes, les sorties, les livraisons et le suivi quotidien.",
  },
  {
    title: "Temps et pointage",
    text: "Structurez les heures, les pauses et les validations dans une meme lecture.",
  },
  {
    title: "Documents",
    text: "Centralisez les photos, les preuves, les formulaires et les pieces utiles.",
  },
  {
    title: "Ressources",
    text: "Gardez vehicules, remorques, employes et acces bien alignes.",
  },
] as const;

const pillars = [
  "Lecture immediate des operations",
  "Structure plus claire pour les equipes",
  "Meilleure execution terrain",
  "Base solide pour grandir",
] as const;

export const metadata: Metadata = {
  title: "Logiciel",
  description:
    "TAGORA Logiciel regroupe vos operations terrain, vos equipes, vos livraisons et votre structure dans une seule plateforme.",
};

export default function Page() {
  return (
    <MarketingShell currentPath="/logiciel">
      <PageIntro
        eyebrow="TAGORA Logiciel"
        title="Un pilotage plus clair pour vos operations."
        description="TAGORA Logiciel rassemble les modules essentiels pour mieux coordonner le terrain, les ressources, les livraisons et le suivi operationnel."
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
              Pourquoi TAGORA
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Une plateforme qui remet de l ordre dans l execution.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              L objectif n est pas d ajouter un outil de plus. TAGORA structure ce qui existe deja pour rendre vos operations plus lisibles, plus suivies et plus fiables.
            </p>
            <div className="mt-8 grid gap-3">
              {pillars.map((pillar, index) => (
                <div
                  key={pillar}
                  className="flex items-center gap-4 rounded-[1.3rem] bg-slate-50 px-4 py-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] text-sm font-semibold text-white">
                    0{index + 1}
                  </div>
                  <p className="text-sm font-medium text-slate-700">{pillar}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fe_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-800/80">
                  Structure produit
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                  Les modules qui font avancer l operationnel.
                </h2>
              </div>
              <div className="hidden rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white lg:inline-flex">
                SaaS terrain
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {modules.map((module, index) => (
                <article
                  key={module.title}
                  className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">{module.title}</h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">{module.text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-8 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-7xl rounded-[2.3rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8fd_100%)] p-6 shadow-[0_26px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[1.9rem] bg-slate-950 p-6 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
              <p className="text-xs uppercase tracking-[0.22em] text-sky-200/72">
                Apercu operationnel
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
                Une lecture centralisee de l execution.
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  ["Equipes", "06 zones actives"],
                  ["Livraisons", "18 ordres aujourd hui"],
                  ["Temps", "Validation plus fluide"],
                  ["Ressources", "Affectations plus claires"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4"
                  >
                    <div className="text-sm font-semibold text-white">{label}</div>
                    <div className="mt-2 text-sm text-slate-300">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.9rem] border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-800/80">
                Mise en ligne rapide
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                Une V1 credible, puis une evolution par etapes.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-600">
                Le logiciel peut etre presente des maintenant avec une proposition claire: mieux structurer le terrain, centraliser les flux et donner une base plus solide a l execution.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Parler a TAGORA
                </Link>
                <Link
                  href="/connexion"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Acceder a l application
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
