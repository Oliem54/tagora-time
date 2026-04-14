import Link from "next/link";

export default function CTASection() {
  return (
    <section id="contact" className="px-6 py-10 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[2.4rem] bg-[linear-gradient(135deg,#071629_0%,#0d2242_54%,#16345f_100%)] px-6 py-10 shadow-[0_36px_120px_rgba(4,15,30,0.30)] sm:px-8 lg:px-12 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200/78">
                Prêt à structurer
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Passez à un système structuré
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-200/90">
                TAGORA vous aide à mieux gérer vos opérations et à préparer votre commerce pour la suite.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                href="mailto:contact@tagora.ca?subject=Demande%20de%20démo%20TAGORA"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Demander une démo
              </Link>
              <Link
                href="mailto:contact@tagora.ca"
                className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
              >
                Nous contacter
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
