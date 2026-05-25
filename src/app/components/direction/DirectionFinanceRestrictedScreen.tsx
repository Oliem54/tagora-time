"use client";

import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";

type DirectionFinanceRestrictedScreenProps = {
  title: string;
  subtitle?: string;
  adminHref: string;
  operationalTitle?: string;
  children?: React.ReactNode;
};

export default function DirectionFinanceRestrictedScreen({
  title,
  subtitle,
  adminHref,
  operationalTitle = "Donnees operationnelles disponibles",
  children,
}: DirectionFinanceRestrictedScreenProps) {
  return (
    <div className="page-container">
      <section
        className="tagora-panel"
        style={{
          marginBottom: 24,
          padding: "28px 28px 24px",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          background:
            "linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.92) 55%, rgba(254, 243, 199, 0.35) 100%)",
          boxShadow: "0 18px 48px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(145deg, #0f172a 0%, #334155 100%)",
              color: "#f8fafc",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={26} strokeWidth={1.75} />
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "0.72rem",
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Acces confidentiel — Administration
            </p>
            <h1
              className="section-title"
              style={{ margin: "10px 0 8px", fontSize: "clamp(1.35rem, 2.5vw, 1.85rem)" }}
            >
              {title}
            </h1>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#334155", maxWidth: 720 }}>
              {subtitle ??
                "Cette section financiere est maintenant reservee a Admin. La Direction conserve seulement les donnees operationnelles. Les donnees de paie, remuneration, commissions et couts sont accessibles dans Admin."}
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(15, 23, 42, 0.06)",
              color: "#0f172a",
              fontSize: "0.88rem",
              fontWeight: 600,
            }}
          >
            <LockKeyhole size={16} />
            Montants masques cote Direction (Phase 2A)
          </span>
          <Link
            href={adminHref}
            className="tagora-dark-action"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            Ouvrir dans Admin
          </Link>
        </div>

        <ul
          style={{
            margin: "18px 0 0",
            paddingLeft: 18,
            color: "#475569",
            lineHeight: 1.55,
            fontSize: "0.92rem",
          }}
        >
          <li>Salaires, taux horaires, commissions en dollars, bonus, marges et coûts de paie : Admin seulement.</li>
          <li>Ventilation financiere Oliem / Titan et exports CSV financiers : Admin seulement.</li>
          <li>La Direction garde heures, presences, statuts et objectifs operationnels sans montants.</li>
        </ul>
      </section>

      {children ? (
        <section style={{ marginTop: 8 }}>
          <h2 className="section-title" style={{ marginBottom: 14 }}>
            {operationalTitle}
          </h2>
          {children}
        </section>
      ) : null}
    </div>
  );
}
