const modules = [
  { title: "Terrain", detail: "Équipes et interventions" },
  { title: "Livraisons", detail: "Planification et suivi" },
  { title: "Temps", detail: "Pointage et feuilles de temps" },
  { title: "Documents", detail: "Photos, preuves et pièces" },
  { title: "Ressources", detail: "Véhicules et affectations" },
  { title: "Gestion", detail: "Accès, structure et pilotage" },
] as const;

export default function PlatformPreview() {
  return (
    <section id="plateforme" className="px-6 py-10 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-800/80">
            Plateforme
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Une plateforme complète pour piloter vos opérations
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Une architecture claire pour centraliser le terrain, les ressources, le temps et les flux de commerce.
          </p>
        </div>

        <div className="mt-10 rounded-[2.25rem] border border-slate-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8fd_100%)] p-5 shadow-[0_28px_90px_rgba(15,23,42,0.08)] sm:p-7 lg:p-8">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.75rem] bg-slate-950 p-6 text-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/75">
                    Vue globale
                  </p>
                  <p className="mt-2 text-2xl font-semibold">Activité structurée</p>
                </div>
                <div className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-semibold text-white/80">
                  TAGORA
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((module, index) => (
                  <div
                    key={module.title}
                    className="rounded-[1.35rem] border border-white/10 bg-white/6 p-4 backdrop-blur"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-2xl bg-[linear-gradient(135deg,#ffffff_0%,#dbeafe_100%)]" />
                      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/40">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="mt-6 text-base font-semibold text-white">
                      {module.title}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">{module.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Pilotage
                </p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">
                  Une lecture immédiate
                </p>
                <div className="mt-6 space-y-4">
                  {[92, 74, 88].map((value) => (
                    <div key={value}>
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                        <span>Synchronisation</span>
                        <span>{value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#3b82f6_100%)]"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Coordination
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    "Présence terrain",
                    "Traçabilité",
                    "Visibilité équipe",
                    "Standardisation",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[1rem] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
