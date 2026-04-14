const benefits = [
  {
    title: "Réduction des erreurs",
    text: "Des opérations plus fiables et des informations mieux alignées.",
  },
  {
    title: "Gain de temps",
    text: "Moins de tâches manuelles, plus de fluidité au quotidien.",
  },
  {
    title: "Contrôle en temps réel",
    text: "Une vue claire sur le terrain, les équipes et l’exécution.",
  },
  {
    title: "Structure évolutive",
    text: "Une base solide pour standardiser et faire grandir vos opérations.",
  },
] as const;

export default function BenefitsSection() {
  return (
    <section className="px-6 py-10 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="rounded-[1.75rem] border border-slate-200/70 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
            >
              <div className="mb-5 h-12 w-12 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
              <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                {benefit.title}
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {benefit.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
