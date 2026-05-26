"use client";

import { usePathname } from "next/navigation";

type DirectionFinancePhase2NoticeProps = {
  moduleName: string;
  adminHref: string;
};

/**
 * Bandeau Phase 2 : les pages Direction financieres seront remplacees par des vues
 * operationnelles sans montants. Les donnees $ passent par /admin/* (phase 1).
 */
export default function DirectionFinancePhase2Notice({
  moduleName,
  adminHref,
}: DirectionFinancePhase2NoticeProps) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin/")) {
    return null;
  }

  return (
    <div
      className="tagora-panel-muted"
      style={{
        marginTop: 0,
        marginBottom: 20,
        padding: 16,
        borderColor: "rgba(245, 158, 11, 0.55)",
        background: "rgba(255, 251, 235, 0.95)",
      }}
      role="status"
    >
      <p style={{ margin: 0, fontWeight: 700, color: "#92400e" }}>
        TODO Phase 2 — {moduleName} (Direction)
      </p>
      <p style={{ margin: "8px 0 0", lineHeight: 1.55, color: "#78350f", fontSize: "0.92rem" }}>
        Cette page Direction affiche encore des montants (salaires, taux, commissions, marges ou
        ventilation financiere). Elle devra etre remplacee par une vue operationnelle sans montants.
        Les donnees confidentielles et financieres doivent etre consultees via l espace Admin :{" "}
        <a href={adminHref} style={{ fontWeight: 700, color: "#b45309" }}>
          {adminHref}
        </a>
        . Les politiques RLS et les acces Direction seront resserres dans une phase ulterieure.
      </p>
    </div>
  );
}
