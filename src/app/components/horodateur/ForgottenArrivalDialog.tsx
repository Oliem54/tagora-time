"use client";

import { useState } from "react";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import {
  buildForgottenArrivalRequest,
  employeeLocalWorkDate,
} from "@/app/lib/employee-punch-guidance.shared";

type ForgottenArrivalDialogProps = {
  open: boolean;
  shiftOpen: boolean;
  submitting: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (input: { date: string; time: string; reason: string }) => void;
};

export default function ForgottenArrivalDialog({
  open,
  shiftOpen,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: ForgottenArrivalDialogProps) {
  const [date, setDate] = useState(() => employeeLocalWorkDate());
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [formError, setFormError] = useState("");

  if (!open) return null;

  const preview = buildForgottenArrivalRequest({
    date,
    time,
    reason,
    shiftOpen,
  });

  function resetAndClose() {
    setStep("edit");
    setFormError("");
    onClose();
  }

  function goToConfirm() {
    if (!preview.ok) {
      setFormError(preview.error);
      return;
    }
    setFormError("");
    setStep("confirm");
  }

  return (
    <div
      role="presentation"
      onClick={resetAndClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgotten-arrival-title"
        className="tagora-panel"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, marginBottom: 0 }}
      >
        <h2 id="forgotten-arrival-title" className="section-title" style={{ marginBottom: 8 }}>
          Ajouter une heure d&apos;arrivée oubliée
        </h2>
        <p className="tagora-note" style={{ marginTop: 0 }}>
          Cette demande est distincte du pointage. Elle ne crée pas un deuxième pointage
          d&apos;arrivée et n&apos;efface pas le pointage déjà enregistré.
        </p>

        {formError || submitError ? (
          <p role="alert" style={{ color: "#991b1b", fontWeight: 600 }}>
            {submitError || formError}
          </p>
        ) : null}

        {step === "edit" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label className="tagora-field">
              <span className="tagora-label">Date réelle</span>
              <input
                className="tagora-input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Heure réelle</span>
              <input
                className="tagora-input"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
            <label className="tagora-field">
              <span className="tagora-label">Motif</span>
              <textarea
                className="tagora-textarea"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Exemple : j'étais déjà sur le plancher et j'ai oublié de pointer."
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <SecondaryButton type="button" onClick={resetAndClose}>
                Annuler
              </SecondaryButton>
              <PrimaryButton type="button" onClick={goToConfirm} disabled={submitting}>
                Voir le résumé
              </PrimaryButton>
            </div>
          </div>
        ) : preview.ok ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{preview.summary}</p>
            <p className="tagora-note" style={{ margin: 0 }}>
              Approbation requise. Statut après l&apos;envoi : en attente d&apos;approbation.
              {shiftOpen
                ? " Votre quart reste en cours."
                : " Aucun quart n'est ouvert par cette demande."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <SecondaryButton type="button" onClick={() => setStep("edit")} disabled={submitting}>
                Modifier
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={submitting}
                onClick={() => onSubmit({ date, time, reason })}
              >
                {submitting ? "Envoi…" : "Confirmer la demande"}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
