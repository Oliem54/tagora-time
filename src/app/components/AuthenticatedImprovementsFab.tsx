"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import {
  CRITICAL_FIELD_ROUTE_ATTR,
  isCriticalFieldRoute,
} from "@/app/lib/mobile-field-chrome.shared";

export default function AuthenticatedImprovementsFab() {
  const pathname = usePathname();
  const { user, loading } = useCurrentAccess();
  const hiddenMarketingPaths = ["/", "/logiciel", "/etiquettes", "/contact", "/connexion"];

  useEffect(() => {
    const root = document.documentElement;
    if (isCriticalFieldRoute(pathname)) {
      root.setAttribute(CRITICAL_FIELD_ROUTE_ATTR, "true");
    } else {
      root.removeAttribute(CRITICAL_FIELD_ROUTE_ATTR);
    }
    return () => {
      root.removeAttribute(CRITICAL_FIELD_ROUTE_ATTR);
    };
  }, [pathname]);

  if (loading || !user) {
    return null;
  }

  if (
    hiddenMarketingPaths.includes(pathname) ||
    pathname === "/ameliorations" ||
    pathname === "/feedback" ||
    pathname === "/direction/dashboard"
  ) {
    return null;
  }

  return (
    <Link
      href="/ameliorations"
      className="tagora-improvements-fab"
      aria-label="Acceder au module Ameliorations"
    >
      <span className="tagora-improvements-fab-eyebrow">Ameliorations</span>
      <span className="tagora-improvements-fab-label">Acceder</span>
    </Link>
  );
}
