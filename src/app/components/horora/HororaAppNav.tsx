"use client";

import Link from "next/link";
import { cn } from "@/app/components/ui/cn";
import {
  hororaNavForWorkspace,
  type HororaNavId,
  type HororaWorkspace,
} from "./horora-nav";

type HororaAppNavProps = {
  workspace: HororaWorkspace;
  active: HororaNavId;
  className?: string;
  variant?: "sidebar" | "header" | "default";
  onNavigate?: () => void;
};

export default function HororaAppNav({
  workspace,
  active,
  className,
  variant = "sidebar",
  onNavigate,
}: HororaAppNavProps) {
  const isSidebar = variant === "sidebar";
  const items = hororaNavForWorkspace(workspace);

  return (
    <nav
      aria-label="Navigation HORORA"
      className={cn(
        "horodateur-direction-module-nav",
        isSidebar && "horodateur-direction-module-nav--sidebar",
        variant === "header" && "horodateur-direction-module-nav--header",
        className
      )}
    >
      <div className="horodateur-direction-module-nav-links">
        {items.map((item) => {
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
    </nav>
  );
}
