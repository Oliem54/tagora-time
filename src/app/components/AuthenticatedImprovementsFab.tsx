"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";

export default function AuthenticatedImprovementsFab() {
  const pathname = usePathname();
  const { user, role, loading } = useCurrentAccess();

  if (loading || !user || !role) {
    return null;
  }

  if (
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
