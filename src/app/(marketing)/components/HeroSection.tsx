import Link from "next/link";

const dashboardCards = [
  ["Terrain", "Équipes et présences"],
  ["Livraisons", "Ordres et suivi"],
  ["Documents", "Preuves et médias"],
  ["Ressources", "Véhicules et accès"],
] as const;

const dashboardStats = [
  ["Temps", "11 h 42"],
  ["Alertes", "03"],
  ["Sites", "12"],
  ["Étiquettes", "2 480"],
] as const;

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-14">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)]">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/82 backdrop-blur">
            TAGORA
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[4.5rem] lg:leading-[1.02]">
            Contrôlez vos opérations. Automatisez votre commerce.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200/92 sm:text-xl">
            Un seul système pour gérer vos équipes terrain et vos étiquettes électroniques.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="#logiciel"
              className="inline-flex min-w-36 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_24px_60px_rgba(15,23,42,0.28)] transition hover:bg-slate-100"
            >
              Voir la démo
            </Link>
            <Link
              href="#contact"
              className="inline-flex min-w-36 items-center justify-center rounded-full border border-white/18 bg-white/8 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
            >
              Nous contacter
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.32),transparent_52%)] blur-3xl" />
          <div className="rounded-[2rem] border border-white/10 bg-white/8 p-3 shadow-[0_28px_120px_rgba(4,15,30,0.45)] backdrop-blur-xl">
            <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,22,41,0.96)_0%,rgba(12,34,64,0.96)_100%)] p-4 sm:p-5">
              <div className="flex items-center justify-between rounded-[1.2rem] border border-white/8 bg-white/6 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                    Tableau central
                  </p>
                  <p className="mt-1 text-sm font-medium text-white/88">
                    Opérations synchronisées
                  </p>
                </div>
                <div className="rounded-full bg-emerald-400/16 px-3 py-1 text-xs font-semibold text-emerald-200">
                  En direct
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4 rounded-[1.4rem] bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Flux terrain
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        Structure opérationnelle
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                      24 actifs
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {dashboardCards.map(([title, text]) => (
                      <div
                        key={title}
                        className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="mb-3 h-2 w-16 rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#3b82f6_100%)]" />
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <p className="mt-1 text-sm text-slate-500">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[1.4rem] bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Commerce
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      Prix harmonisés
                    </p>
                    <div className="mt-4 space-y-3">
                      {[86, 68, 92].map((value, index) => (
                        <div key={value} className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Zone {index + 1}</span>
                            <span>{value}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#2563eb_100%)]"
                              style={{ width: `${value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-5 backdrop-blur">
                    <div className="grid grid-cols-2 gap-3">
                      {dashboardStats.map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-[1rem] border border-white/8 bg-slate-950/40 px-4 py-3"
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-300/65">
                            {label}
                          </p>
                          <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
