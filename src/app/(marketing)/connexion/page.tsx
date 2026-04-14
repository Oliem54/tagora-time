import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "../components/site/MarketingShell";
import PageIntro from "../components/site/PageIntro";
import { marketingConnectionLinks } from "../components/site/navigation";

const portals = [
  {
    title: "Connexion employe",
    text: "Acces aux modules terrain, livraisons, documents et operations selon les droits actifs.",
    href: marketingConnectionLinks.employe,
    action: "Acceder cote employe",
  },
  {
    title: "Connexion direction",
    text: "Acces aux tableaux de bord, a la gestion et au pilotage des modules internes.",
    href: marketingConnectionLinks.direction,
    action: "Acceder cote direction",
  },
] as const;

export const metadata: Metadata = {
  title: "Connexion",
  description:
    "Accedez a l application TAGORA ou demandez une demo depuis la page de connexion publique.",
};

export default function Page() {
  return (
    <MarketingShell currentPath="/connexion">
      <PageIntro
        eyebrow="Connexion"
        title="Accedez a l environnement TAGORA."
        description="La partie applicative reste separee du site public. Cette page sert de point d entree clair vers l application, sans melanger la logique marketing et la logique metier."
        actions={
          <>
            <Link
              href={marketingConnectionLinks.app}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(255,255,255,0.16)] transition hover:bg-slate-100"
            >
              Ouvrir l application
            </Link>
            <Link
              href={marketingConnectionLinks.demoMailto}
              className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
            >
              Demander une demo
            </Link>
          </>
        }
      />

      <section className="px-6 py-8 lg:px-8 lg:py-12">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-5 md:grid-cols-2">
            {portals.map((portal, index) => (
              <article
                key={portal.title}
                className="rounded-[2rem] border border-slate-200/70 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    0{index + 1}
                  </div>
                </div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                  {portal.title}
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-600">{portal.text}</p>
                <div className="mt-6">
                  <Link
                    href={portal.href}
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {portal.action}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-[2.2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fe_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-800/80">
              Separation claire
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
              Le site et l application restent distincts.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              Le site public presente TAGORA. L application tourne ensuite dans son environnement dedie, separe du marketing et de l acquisition.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                ["Site", "tagora.ca"],
                ["Application", "app.tagora.ca"],
                ["Demo", "demo.tagora.ca"],
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
