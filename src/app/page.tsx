import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0b2447_0%,#12386b_42%,#eef3fa_42%,#f5f7fb_100%)] px-6 py-10 text-[var(--text-main)] md:px-8 md:py-14">
      <div className="mx-auto flex w-full max-w-5xl justify-center">
        <section className="w-full overflow-hidden rounded-[36px] border border-white/12 bg-[linear-gradient(180deg,rgba(11,36,71,0.96)_0%,rgba(18,56,107,0.94)_38%,rgba(255,255,255,1)_38%,rgba(255,255,255,1)_100%)] px-6 py-10 text-center shadow-[0_26px_80px_rgba(15,41,72,0.26)] md:px-12 md:py-14">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <div className="mb-8 w-full max-w-[360px] rounded-[30px] border border-white/12 bg-[linear-gradient(145deg,#081b36_0%,#0f2f5c_55%,#1d4f8f_100%)] px-7 py-6 shadow-[0_20px_50px_rgba(3,13,29,0.42)] ring-1 ring-white/10 md:mb-10 md:max-w-[460px] md:px-10 md:py-8">
              <div className="rounded-[24px] border border-white/12 bg-white/5 px-4 py-3">
                <Image
                  src="/logo.png"
                  alt="Logo TAGORA"
                  width={360}
                  height={180}
                  priority
                  className="mx-auto h-auto w-full max-w-[300px] md:max-w-[360px]"
                />
              </div>
            </div>

            <div className="space-y-4 md:space-y-5">
              <p className="mx-auto max-w-2xl text-lg font-semibold leading-relaxed text-white md:text-2xl">
                Pointage, heures, terrain, depenses et approbations
              </p>

              <p className="mx-auto max-w-2xl text-base leading-7 text-white/80 md:text-lg">
                Une plateforme simple pour gerer les employes, les horaires, les sorties terrain
                et les validations de la direction.
              </p>
            </div>

            <div className="mt-10 flex w-full flex-col justify-center gap-4 sm:flex-row md:mt-12">
              <Link
                href="/employe"
                className="tagora-dark-action min-w-[220px] px-8 py-4 text-lg shadow-[0_10px_24px_rgba(15,41,72,0.32)]"
              >
                Connexion employe
              </Link>

              <Link
                href="/direction"
                className="min-w-[220px] rounded-xl border border-white/30 bg-white/10 px-8 py-4 text-lg font-semibold text-white transition hover:bg-white hover:text-[var(--tagora-blue-deep)]"
              >
                Connexion direction
              </Link>
            </div>

            <div className="mt-10 w-full max-w-4xl rounded-[28px] border border-slate-200 bg-white px-6 py-8 text-left shadow-[0_18px_50px_rgba(15,41,72,0.10)] md:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--tagora-blue-soft)]">
                TAGORA Time
              </p>
              <p className="mt-3 text-base leading-7 text-slate-600 md:text-lg">
                Une interface de travail claire pour les equipes terrain et la direction, avec un
                univers visuel bleu fonce constant et un logo garde uniquement sur support sombre.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
