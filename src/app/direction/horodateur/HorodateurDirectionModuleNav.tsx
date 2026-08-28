"use client";

import Link from "next/link";
import {
  Activity,
  CalendarRange,
  FileSpreadsheet,
  LayoutDashboard,
  Wallet,
} from "lucide-react";
import { cn } from "@/app/components/ui/cn";

export type HorodateurDirectionModuleNavActive =
  | "live"
  | "registre"
  | "quarts"
  | "paie";

const MODULE_LINKS: {
  id: HorodateurDirectionModuleNavActive;
  href: string;
  label: string;
  icon: typeof Activity;
}[] = [
  { id: "live", href: "/direction/horodateur", label: "Horodateur live", icon: Activity },
  {
    id: "registre",
    href: "/direction/horodateur/registre",
    label: "Registre",
    icon: FileSpreadsheet,
  },
  {
    id: "quarts",
    href: "/direction/horodateur/quarts",
    label: "Quarts passés",
    icon: CalendarRange,
  },
  {
    id: "paie",
    href: "/direction/horodateur/rapport-comptable",
    label: "Rapport comptable",
    icon: Wallet,
  },
];

type HorodateurDirectionModuleNavProps = {
  active: HorodateurDirectionModuleNavActive;
  className?: string;
  variant?: "sidebar" | "header" | "default";
  onNavigate?: () => void;
};

export default function HorodateurDirectionModuleNav({
  active,
  className,
  variant = "sidebar",
  onNavigate,
}: HorodateurDirectionModuleNavProps) {
  const isSidebar = variant === "sidebar";

  return (
    <nav
      aria-label="Navigation module horodateur"
      className={cn(
        "horodateur-direction-module-nav",
        isSidebar && "horodateur-direction-module-nav--sidebar",
        variant === "header" && "horodateur-direction-module-nav--header",
        className
      )}
    >
      <div className="horodateur-direction-module-nav-links">
        {MODULE_LINKS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          const content = (
            <>
              <Icon size={16} strokeWidth={1.8} aria-hidden />
              <span>{item.label}</span>
            </>
          );

          if (isActive) {
            return (
              <span
                key={item.id}
                className="horodateur-direction-module-nav-item horodateur-direction-module-nav-item--active"
                aria-current="page"
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className="horodateur-direction-module-nav-item"
              onClick={onNavigate}
            >
              {content}
            </Link>
          );
        })}
      </div>
      <Link
        href="/direction/dashboard"
        className="horodateur-direction-module-nav-dashboard"
        onClick={onNavigate}
      >
        <LayoutDashboard size={16} strokeWidth={1.8} aria-hidden />
        <span>Tableau de bord</span>
      </Link>
    </nav>
  );
}
