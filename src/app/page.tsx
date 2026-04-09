import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-main)] px-6 py-10 text-[var(--text-main)] md:px-8 md:py-14">
      <div className="mx-auto flex w-full max-w-5xl justify-center">
        <section className="w-full rounded-[32px] border border-white/80 bg-white/80 px-6 py-10 text-center shadow-[0_24px_70px_rgba(15,41,72,0.08)] backdrop-blur-sm md:px-12 md:py-14">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <div className="mb-8 w-full max-w-[340px] rounded-[28px] border border-[var(--tagora-lime-border)] bg-[linear-gradient(145deg,var(--tagora-blue-deep)_0%,#16375d_55%,var(--tagora-blue-soft)_100%)] px-6 py-5 shadow-[0_18px_40px_rgba(15,41,72,0.28)] ring-1 ring-white/10 md:mb-10 md:max-w-[420px] md:px-8 md:py-6">
              <div className="rounded-[22px] border border-white/10 bg-white/3 px-3 py-2">
                <Image
                  src="/logo.png"
                  alt="Logo TAGORA"
                  width={320}
                  height={320}
                  priority
                  className="mx-auto h-auto w-full max-w-[280px] md:max-w-[320px]"
                />
              </div>
            </div>

            <div className="space-y-4 md:space-y-5">
              <p className="mx-auto max-w-2xl text-lg font-semibold leading-relaxed text-[var(--tagora-blue)] md:text-2xl">
                Pointage, heures, terrain, dépenses et approbations
              </p>

              <p className="mx-auto max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                Une plateforme simple pour gérer les employés, les horaires, les sorties terrain
                et les validations de la direction.
              </p>
            </div>

            <div className="mt-10 flex w-full flex-col justify-center gap-4 sm:flex-row md:mt-12">
              <Link
                href="/employe"
                className="tagora-dark-action min-w-[220px] px-8 py-4 text-lg shadow-[0_10px_24px_rgba(15,41,72,0.22)]"
              >
                Connexion employé
              </Link>

              <Link
                href="/direction"
                className="tagora-dark-outline-action min-w-[220px] border px-8 py-4 text-lg"
              >
                Connexion direction
              </Link>
            </div>

            <div className="mt-8 h-px w-full max-w-md bg-gradient-to-r from-transparent via-[var(--tagora-lime)]/60 to-transparent md:mt-10" />
          </div>
        </section>
      </div>
    </main>
  );
}
