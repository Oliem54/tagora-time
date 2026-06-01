"use client";

import Link from "next/link";
import { cn } from "@/app/components/ui/cn";

export type HorodateurDirectionModuleNavActive = "live" | "registre" | "quarts";

const MODULE_LINKS: {
  id: HorodateurDirectionModuleNavActive;
  href: string;
  label: string;
}[] = [
  { id: "live", href: "/direction/horodateur", label: "Horodateur live" },
  { id: "registre", href: "/direction/horodateur/registre", label: "Registre" },
  { id: "quarts", href: "/direction/horodateur/quarts", label: "Quarts passés" },
];

type HorodateurDirectionModuleNavProps = {
  active: HorodateurDirectionModuleNavActive;
  className?: string;
};

export default function HorodateurDirectionModuleNav({
  active,
  className,
}: HorodateurDirectionModuleNavProps) {
  return (
    <nav
      aria-label="Navigation module horodateur"
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-200/35 p-1.5 shadow-inner",
        className
      )}
    >
      {MODULE_LINKS.map((item) => {
        const isActive = item.id === active;
        if (isActive) {
          return (
            <span
              key={item.id}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              aria-current="page"
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 no-underline transition hover:bg-white/60 hover:text-slate-900"
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/direction/dashboard"
        className="tagora-dark-action ml-0.5 shrink-0"
        style={{ textDecoration: "none" }}
      >
        Tableau de bord
      </Link>
    </nav>
  );
}
