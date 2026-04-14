const labels = [
  "Mise a jour instantanee",
  "Reduction des erreurs",
  "Compatible avec votre evolution",
] as const;

export default function LabelsSection() {
  return (
    <section className="px-6 py-10 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-8 rounded-[2.5rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f3f8ff_100%)] p-6 shadow-[0_32px_110px_rgba(15,23,42,0.08)] sm:p-8 lg:grid-cols-[0.92fr_1.08fr] lg:p-11">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-800/80">
            Commerce connecte
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-[3rem]">
            Des prix synchronises. Une image plus moderne.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            TAGORA permet d integrer des etiquettes electroniques pour automatiser l affichage en magasin et reduire les interventions manuelles.
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
          <div className="rounded-[2.2rem] border border-slate-200 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.1)]">
            <div className="rounded-[1.9rem] bg-[linear-gradient(180deg,#071629_0%,#0d2242_100%)] p-5">
              <div className="mb-4 flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/6 px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
                    Etiquettes connectees
                  </div>
                  <div className="mt-1 text-sm font-medium text-white">
                    Diffusion uniforme des prix
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
      </div>
    </section>
  );
}
