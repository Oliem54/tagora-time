import Link from "next/link";

const solutions = [
  {
    id: "logiciel",
    eyebrow: "TAGORA Logiciel",
    title: "TAGORA Logiciel",
    text: "Gérez vos employés, vos opérations, vos livraisons et votre terrain dans une seule plateforme.",
    action: "Découvrir le logiciel",
    href: "#plateforme",
    tone: "dark",
  },
  {
    id: "etiquettes",
    eyebrow: "TAGORA Étiquettes électroniques",
    title: "TAGORA Étiquettes électroniques",
    text: "Automatisez l’affichage des prix en magasin avec des étiquettes électroniques connectées et évolutives.",
    action: "Découvrir les étiquettes",
    href: "#contact",
    tone: "light",
  },
] as const;

export default function SolutionCards() {
  return (
    <section className="px-6 py-8 lg:px-8 lg:py-14">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        {solutions.map((solution) => (
          <article
            key={solution.title}
            id={solution.id}
            className={
              solution.tone === "dark"
                ? "rounded-[2rem] border border-slate-200/70 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]"
                : "rounded-[2rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]"
            }
          >
            <div
              className={
                solution.tone === "dark"
                  ? "mb-8 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
                  : "mb-8 inline-flex rounded-full bg-sky-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-900"
              }
            >
              {solution.eyebrow}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              {solution.title}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              {solution.text}
            </p>
            <div className="mt-8 flex items-center justify-between gap-4 rounded-[1.5rem] bg-slate-50 p-5">
              <div className="space-y-2">
                <div className="h-2 w-24 rounded-full bg-slate-200" />
                <div className="h-2 w-16 rounded-full bg-sky-200" />
                <div className="h-2 w-20 rounded-full bg-slate-200" />
              </div>
              <div className="grid w-44 grid-cols-2 gap-3">
                <div className="rounded-[1rem] bg-white p-4 shadow-sm">
                  <div className="h-10 rounded-xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                </div>
                <div className="rounded-[1rem] bg-white p-4 shadow-sm">
                  <div className="h-10 rounded-xl bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_100%)]" />
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Link
                href={solution.href}
                className={
                  solution.tone === "dark"
                    ? "inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    : "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50"
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
