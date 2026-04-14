const benefits = [
  {
    title: "Reduction des erreurs",
    text: "Des operations plus fiables et des informations mieux alignees.",
  },
  {
    title: "Gain de temps",
    text: "Moins de taches manuelles, plus de fluidite au quotidien.",
  },
  {
    title: "Controle en temps reel",
    text: "Une vue claire sur le terrain, les equipes et l execution.",
  },
  {
    title: "Structure evolutive",
    text: "Une base solide pour standardiser et faire grandir vos operations.",
  },
] as const;

export default function BenefitsSection() {
  return (
    <section className="px-6 py-12 lg:px-8 lg:py-18">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-800/80">
            Benefices
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Une base plus claire pour mieux executer
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((benefit, index) => (
            <article
              key={benefit.title}
              className="rounded-[1.9rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  0{index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                {benefit.title}
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{benefit.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
