"use client";

import Link from "next/link";
import { Activity, ArrowRight, CalendarRange, ClipboardPen } from "lucide-react";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import { HORODATEUR_DIRECTION_MISSING_PUNCH_HELP_TEXT } from "@/app/lib/horodateur-expected-punch-missing.shared";

type HorodateurDirectionPrimaryActionsProps = {
  onRetroCorrection: () => void;
  retroDisabled?: boolean;
  current?: "live" | "quarts";
};

export default function HorodateurDirectionPrimaryActions({
  onRetroCorrection,
  retroDisabled = false,
  current = "live",
}: HorodateurDirectionPrimaryActionsProps) {
  return (
    <div className="horodateur-direction-primary-actions-block">
      <section
        aria-label="Actions principales horodateur"
        className="horodateur-direction-primary-actions"
      >
        <div
          role="button"
          tabIndex={retroDisabled ? -1 : 0}
          aria-disabled={retroDisabled || undefined}
          onClick={() => {
            if (!retroDisabled) {
              onRetroCorrection();
            }
          }}
          onKeyDown={(event) => {
            if (retroDisabled) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onRetroCorrection();
            }
          }}
          className={`horodateur-direction-action-card horodateur-direction-action-card--primary${
            retroDisabled ? " horodateur-direction-action-card--disabled" : ""
          }`}
        >
          <div className="horodateur-direction-action-card-top">
            <TagoraIconBadge tone="green" size="lg" className="horodateur-direction-action-icon-badge">
              <ClipboardPen size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
            <span className="horodateur-direction-action-badge">Action principale</span>
          </div>
          <strong className="horodateur-direction-action-title">
            Corriger un oubli de punch
          </strong>
          <p className="horodateur-direction-action-copy">
            Demande rétroactive avec approbation admin — le moyen le plus rapide de corriger un
            oubli.
          </p>
          <span className="horodateur-direction-action-cta">
            Ouvrir le formulaire
            <ArrowRight size={16} />
          </span>
        </div>

        <div
          className={`horodateur-direction-action-card${
            current === "live" ? " horodateur-direction-action-card--current" : ""
          }`}
          aria-current={current === "live" ? "page" : undefined}
        >
          <div className="horodateur-direction-action-card-top">
            <TagoraIconBadge tone="blue" size="lg" className="horodateur-direction-action-icon-badge">
              <Activity size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
            {current === "live" ? (
              <span className="horodateur-direction-action-badge horodateur-direction-action-badge--muted">
                Vous êtes ici
              </span>
            ) : null}
          </div>
          <strong className="horodateur-direction-action-title">Horodateur live</strong>
          <p className="horodateur-direction-action-copy">
            Supervision en temps réel, présences et exceptions du jour.
          </p>
        </div>

        <Link
          href="/direction/horodateur/quarts"
          className={`horodateur-direction-action-card horodateur-direction-action-card--link${
            current === "quarts" ? " horodateur-direction-action-card--current" : ""
          }`}
          aria-current={current === "quarts" ? "page" : undefined}
        >
          <div className="horodateur-direction-action-card-top">
            <TagoraIconBadge tone="slate" size="lg" className="horodateur-direction-action-icon-badge">
              <CalendarRange size={24} strokeWidth={2.1} />
            </TagoraIconBadge>
          </div>
          <strong className="horodateur-direction-action-title">Quarts passés</strong>
          <p className="horodateur-direction-action-copy">
            Consulter un quart antérieur et lancer une correction ciblée.
          </p>
          <span className="horodateur-direction-action-cta">
            Ouvrir les quarts passés
            <ArrowRight size={16} />
          </span>
        </Link>
      </section>

      <p className="horodateur-direction-help-note">{HORODATEUR_DIRECTION_MISSING_PUNCH_HELP_TEXT}</p>
    </div>
  );
}
