import Link from "next/link";

const solutions = [
  {
    id: "logiciel",
    eyebrow: "TAGORA Logiciel",
    title: "TAGORA Logiciel",
    text: "Regroupez vos equipes, vos operations, vos livraisons et votre terrain dans une seule plateforme de pilotage.",
    action: "Decouvrir le logiciel",
    href: "/logiciel",
    tone: "dark",
    points: ["Equipes et acces", "Terrain et livraisons", "Temps et structure"],
  },
  {
    id: "etiquettes",
    eyebrow: "TAGORA Etiquettes electroniques",
    title: "TAGORA Etiquettes electroniques",
    text: "Automatisez l affichage des prix en magasin avec des etiquettes connectees, lisibles et evolutives.",
    action: "Decouvrir les etiquettes",
    href: "/etiquettes",
    tone: "light",
    points: ["Prix synchronises", "Mises a jour rapides", "Parcours magasin plus moderne"],
  },
] as const;

export default function SolutionCards() {
  return (
    <section className="px-6 py-10 lg:px-8 lg:py-16">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        {solutions.map((solution) => (
          <article
            key={solution.title}
            id={solution.id}
            className={
              solution.tone === "dark"
                ? "rounded-[2.35rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fe_100%)] p-8 shadow-[0_28px_90px_rgba(15,23,42,0.08)] lg:p-9"
                : "rounded-[2.35rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#eef6ff_100%)] p-8 shadow-[0_28px_90px_rgba(15,23,42,0.08)] lg:p-9"
            }
          >
            <div
              className={
                solution.tone === "dark"
                  ? "mb-7 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
                  : "mb-7 inline-flex rounded-full bg-sky-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-900"
              }
            >
              {solution.eyebrow}
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 lg:text-[2.35rem]">
                  {solution.title}
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-[1.05rem]">
                  {solution.text}
                </p>
                <div className="mt-6 flex flex-wrap gap-2.5">
                  {solution.points.map((point) => (
                    <span
                      key={point}
                      className="rounded-full border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-600"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className={
                  solution.tone === "dark"
                    ? "rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                    : "rounded-[1.8rem] border border-sky-100 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
                }
              >
                <div className="grid gap-3">
                  <div className="rounded-[1.15rem] bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] p-4 text-white">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/70">
                      TAGORA
                    </div>
                    <div className="mt-2 text-sm font-semibold">
                      {solution.tone === "dark" ? "Operations" : "Etiquettes"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[1rem] bg-slate-50 p-4">
                      <div className="h-8 rounded-xl bg-[linear-gradient(135deg,#e2e8f0_0%,#ffffff_100%)]" />
                    </div>
                    <div className="rounded-[1rem] bg-slate-50 p-4">
                      <div className="h-8 rounded-xl bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_100%)]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={solution.href}
                className={
                  solution.tone === "dark"
                    ? "inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
                    : "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50"
                }
              >
                {solution.action}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
