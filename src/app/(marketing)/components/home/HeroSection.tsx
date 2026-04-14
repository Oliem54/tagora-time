import Link from "next/link";

const dashboardCards = [
  ["Terrain", "Equipes et presences"],
  ["Livraisons", "Ordres et suivi"],
  ["Documents", "Preuves et medias"],
  ["Ressources", "Vehicules et acces"],
] as const;

const dashboardStats = [
  ["Temps", "11 h 42"],
  ["Alertes", "03"],
  ["Sites", "12"],
  ["Etiquettes", "2 480"],
] as const;

const proofPoints = [
  "Pilotage terrain centralise",
  "Prix et operations alignes",
  "Structure deployable multi-site",
] as const;

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-10 lg:px-8 lg:pb-28 lg:pt-16">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(500px,0.98fr)]">
        <div className="max-w-3xl">
          <div className="mb-7 inline-flex items-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/82 backdrop-blur">
            TAGORA
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-[5.2rem] lg:leading-[0.96]">
            Controlez vos operations. Automatisez votre commerce.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-200/92 sm:text-xl lg:text-[1.35rem]">
            Un seul systeme pour gerer vos equipes terrain et vos etiquettes electroniques.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/logiciel"
              className="inline-flex min-w-40 items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_28px_90px_rgba(15,23,42,0.32)] transition hover:bg-slate-100"
            >
              Voir la demo
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-w-40 items-center justify-center rounded-full border border-white/18 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
            >
              Nous contacter
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {proofPoints.map((item) => (
              <div
                key={item}
                className="rounded-[1.5rem] border border-white/10 bg-white/7 px-4 py-4 backdrop-blur"
              >
                <div className="mb-3 h-2 w-12 rounded-full bg-[linear-gradient(90deg,#93c5fd_0%,#ffffff_100%)]" />
                <p className="text-sm font-medium leading-6 text-slate-100">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -right-10 -top-8 -z-10 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="absolute -bottom-10 -left-8 -z-10 h-52 w-52 rounded-full bg-blue-600/18 blur-3xl" />

          <div className="rounded-[2.4rem] border border-white/10 bg-white/8 p-3 shadow-[0_32px_140px_rgba(4,15,30,0.5)] backdrop-blur-xl">
            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,22,41,0.97)_0%,rgba(12,34,64,0.98)_100%)] p-4 sm:p-5">
              <div className="rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)] p-4">
                <div className="mb-4 flex items-center justify-between gap-4 rounded-[1.15rem] border border-white/8 bg-white/6 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/22" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/22" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
                        Tableau central
                      </p>
                      <p className="mt-1 text-sm font-medium text-white/88">
                        Operations synchronisees
                      </p>
                    </div>
                  </div>
                  <div className="rounded-full bg-emerald-400/16 px-3 py-1 text-xs font-semibold text-emerald-200">
                    En direct
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                  <div className="space-y-4 rounded-[1.7rem] bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.16)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                          Flux terrain
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900">
                          Structure operationnelle
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        24 actifs
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {dashboardCards.map(([title, text], index) => (
                        <div
                          key={title}
                          className="rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <div className="h-9 w-9 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)]" />
                            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              0{index + 1}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{title}</p>
                          <p className="mt-1 text-sm text-slate-500">{text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[1.25rem] bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                        <span>Cadence operationnelle</span>
                        <span>93%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-200">
                        <div className="h-2.5 w-[93%] rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_100%)]" />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-[1.7rem] bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.16)]">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                        Commerce
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        Prix harmonises
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

                    <div className="grid grid-cols-2 gap-3">
                      {dashboardStats.map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur"
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-300/65">
                            {label}
                          </p>
                          <p className="mt-3 text-xl font-semibold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
                      <div className="grid grid-cols-3 gap-3">
                        {[34, 58, 79].map((value) => (
                          <div key={value} className="rounded-[1rem] bg-slate-950/45 px-3 py-3 text-center">
                            <div
                              className="mx-auto h-14 w-14 rounded-full border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.22),rgba(37,99,235,0.18))]"
                              style={{
                                boxShadow: `inset 0 -10px 18px rgba(15,23,42,0.35), 0 0 0 ${Math.max(
                                  4,
                                  value / 20
                                )}px rgba(147,197,253,0.05)`,
                              }}
                            />
                            <p className="mt-3 text-sm font-semibold text-white">{value}</p>
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
      </div>
    </section>
  );
}
