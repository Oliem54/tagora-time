import Link from "next/link";
import { marketingConnectionLinks } from "../site/navigation";

export default function CTASection() {
  return (
    <section id="contact" className="px-6 py-10 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[2.6rem] bg-[linear-gradient(135deg,#071629_0%,#0d2242_50%,#16345f_100%)] px-6 py-10 shadow-[0_36px_120px_rgba(4,15,30,0.3)] sm:px-8 lg:px-12 lg:py-16">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sky-400/16 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-blue-500/14 blur-3xl" />

          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200/78">
                Pret a structurer
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl lg:text-[3.2rem]">
                Passez a un systeme structure
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-200/90">
                TAGORA vous aide a mieux gerer vos operations et a preparer votre commerce pour la suite.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                href={marketingConnectionLinks.demoMailto}
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_20px_50px_rgba(255,255,255,0.16)] transition hover:bg-slate-100"
              >
                Demander une demo
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/12"
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
