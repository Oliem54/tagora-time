const labels = [
  "Mise à jour instantanée",
  "Réduction des erreurs",
  "Compatible avec votre évolution",
] as const;

export default function LabelsSection() {
  return (
    <section className="px-6 py-10 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-8 rounded-[2.25rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:p-10">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-800/80">
            Commerce connecté
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Des prix synchronisés. Une image plus moderne.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            TAGORA permet d’intégrer des étiquettes électroniques pour automatiser l’affichage en magasin et réduire les interventions manuelles.
          </p>
          <div className="mt-8 grid gap-3">
            {labels.map((label) => (
              <div
                key={label}
                className="inline-flex items-center gap-3 rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white sm:w-fit"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-sky-300" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.20),transparent_58%)] blur-2xl" />
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
            <div className="rounded-[1.7rem] bg-slate-950 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1.25rem] border border-white/10 bg-white/7 p-4"
                  >
                    <div className="rounded-[1rem] border border-sky-200/30 bg-[linear-gradient(180deg,#ffffff_0%,#e0f2fe_100%)] px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-sky-900/60">
                            Rayon {item}
                          </div>
                          <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                            12,99 $
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
      </div>
    </section>
  );
}
