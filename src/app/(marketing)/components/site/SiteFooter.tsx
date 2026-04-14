import Link from "next/link";
import { marketingConnectionLinks, marketingNavigation } from "./navigation";

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/70 px-6 py-8 backdrop-blur lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-md">
          <div className="text-[0.95rem] font-semibold tracking-[0.32em] text-slate-950">
            TAGORA
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Plateforme de gestion operationnelle et d automatisation commerciale.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-6">
          {marketingNavigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={marketingConnectionLinks.root}
            className="text-sm font-semibold text-slate-950 transition hover:text-slate-700"
          >
            Connexion
          </Link>
        </div>
      </div>
    </footer>
  );
}
