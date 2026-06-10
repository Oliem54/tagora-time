"use client";

import Link from "next/link";
import {
  Activity,
  CalendarRange,
  FileSpreadsheet,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/app/components/ui/cn";

export type HorodateurDirectionModuleNavActive = "live" | "registre" | "quarts";

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
];

type HorodateurDirectionModuleNavProps = {
  active: HorodateurDirectionModuleNavActive;
  className?: string;
  variant?: "header" | "default";
};

export default function HorodateurDirectionModuleNav({
  active,
  className,
  variant = "default",
}: HorodateurDirectionModuleNavProps) {
  const isHeader = variant === "header";

  return (
    <nav
      aria-label="Navigation module horodateur"
      className={cn(
        "horodateur-direction-module-nav",
        isHeader && "horodateur-direction-module-nav--header",
        className
      )}
    >
      <div className="horodateur-direction-module-nav-links">
        {MODULE_LINKS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          const content = (
            <>
              <Icon size={16} strokeWidth={2.1} aria-hidden />
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
            >
              {content}
            </Link>
          );
        })}
      </div>
      <Link
        href="/direction/dashboard"
        className="horodateur-direction-module-nav-dashboard"
      >
        <LayoutDashboard size={16} strokeWidth={2.1} aria-hidden />
        <span>Tableau de bord</span>
      </Link>
    </nav>
  );
}
