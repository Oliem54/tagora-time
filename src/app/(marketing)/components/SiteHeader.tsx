import Link from "next/link";

const navigation = [
  { label: "Accueil", href: "#accueil" },
  { label: "Logiciel", href: "#logiciel" },
  { label: "Étiquettes", href: "#etiquettes" },
  { label: "Contact", href: "#contact" },
] as const;

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/45 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
        <Link
          href="#accueil"
          className="text-[0.95rem] font-semibold tracking-[0.32em] text-white"
        >
          TAGORA
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-white/78 transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="https://app.tagora.ca"
          className="inline-flex items-center justify-center rounded-full border border-white/16 bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(255,255,255,0.16)] transition hover:bg-slate-100"
        >
          Connexion
        </Link>
      </div>
    </header>
  );
}
