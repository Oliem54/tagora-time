"use client";

import { useMemo, useState } from "react";

import type {
  AppActionResponse,
  AppActionTokenDetailRow,
  AppActionTokenPageView,
} from "@/app/lib/app-action-tokens.shared";

type ActionTokenClientProps = {
  token: string;
  initialView: AppActionTokenPageView;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | {
      status: "done";
      outcome: "accepted" | "rejected";
      message: string;
      extraNote?: string | null;
    }
  | { status: "error"; message: string };

export default function ActionTokenClient({ token, initialView }: ActionTokenClientProps) {
  const [view, setView] = useState<AppActionTokenPageView>(initialView);
  const [selectedResponse, setSelectedResponse] = useState<AppActionResponse | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const encodedToken = useMemo(() => encodeURIComponent(token), [token]);

  async function submitDecision(response: AppActionResponse) {
    if (response === "reject" && !responseNote.trim()) {
      setSubmitState({
        status: "error",
        message: "La raison est obligatoire pour un refus.",
      });
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const res = await fetch(`/api/action/${encodedToken}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          responseNote: response === "reject" ? responseNote.trim() : null,
        }),
      });

      const payload = (await res.json()) as {
        ok?: boolean;
        outcome?: "accepted" | "rejected";
        message?: string;
        extraNote?: string | null;
        error?: string;
        code?: string;
      };

      if (!res.ok || !payload.ok) {
        const message = payload.error ?? "Impossible d'enregistrer votre reponse.";
        if (payload.code === "already_used") {
          setView({
            state: "used",
            message: "Ce lien a deja ete utilise.",
            response: null,
          });
        } else if (payload.code === "already_handled") {
          setView({
            state: "already_handled",
            message,
          });
        }
        setSubmitState({ status: "error", message });
        return;
      }

      setSubmitState({
        status: "done",
        outcome: payload.outcome ?? (response === "accept" ? "accepted" : "rejected"),
        message: payload.message ?? "Votre decision a ete enregistree.",
        extraNote: payload.extraNote ?? null,
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "Erreur reseau. Reessayez dans un instant.",
      });
    }
  }

  if (submitState.status === "done") {
    return (
      <main className="page-container" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <StatusPanel
          title={submitState.outcome === "accepted" ? "Demande acceptee" : "Demande refusee"}
          message={submitState.message}
          tone="success"
          extraNote={submitState.extraNote}
        />
      </main>
    );
  }

  if (view.state !== "ready") {
    const tone =
      view.state === "used" || view.state === "already_handled"
        ? "warning"
        : view.state === "config_error"
          ? "error"
          : "warning";
    const title =
      view.state === "used"
        ? "Lien deja utilise"
        : view.state === "expired"
          ? "Lien expire"
          : view.state === "already_handled"
            ? "Demande deja traitee"
            : view.state === "config_error"
              ? "Service indisponible"
              : "Lien invalide";

    return (
      <main className="page-container" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <StatusPanel title={title} message={view.message} tone={tone} />
      </main>
    );
  }

  const saving = submitState.status === "submitting";
  const rejectSelected = selectedResponse === "reject";

  return (
    <main className="page-container" style={{ paddingTop: 24, paddingBottom: 32 }}>
      <ActionPanel>
        <TagoraLogo />

        <h1 className="section-title" style={{ marginBottom: 8 }}>
          {view.title}
        </h1>
        <p className="tagora-note" style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.55 }}>
          {view.summary}
        </p>

        {view.detailRows.length ? <DetailRows rows={view.detailRows} /> : null}

        <p className="tagora-note" style={{ marginTop: 16, marginBottom: 20 }}>
          Expire le : {view.expiresAtLabel}
        </p>

        <DecisionButtons
          saving={saving}
          rejectSelected={rejectSelected}
          onAccept={() => void submitDecision("accept")}
          onReject={() => {
            setSelectedResponse("reject");
            setSubmitState({ status: "idle" });
          }}
        />

        {rejectSelected ? (
          <>
            <label className="tagora-field" style={{ marginBottom: 16 }}>
              <span className="tagora-label">Raison du refus (obligatoire)</span>
              <textarea
                className="tagora-textarea"
                value={responseNote}
                onChange={(event) => setResponseNote(event.target.value)}
                placeholder="Expliquez brievement le motif du refus..."
                rows={4}
                disabled={saving}
              />
            </label>
            <button
              type="button"
              className="tagora-dark-outline-action"
              style={{
                width: "100%",
                minHeight: 48,
                marginBottom: 12,
                borderColor: "#b91c1c",
                color: "#b91c1c",
              }}
              disabled={saving}
              onClick={() => void submitDecision("reject")}
            >
              {saving ? "Envoi en cours..." : "Confirmer le refus"}
            </button>
          </>
        ) : (
          <p className="tagora-note" style={{ margin: 0 }}>
            Accepter enregistre la decision immediatement. Refuser demande une raison.
          </p>
        )}

        {submitState.status === "error" ? (
          <p style={{ margin: "16px 0 0", color: "#b91c1c", lineHeight: 1.5 }}>
            {submitState.message}
          </p>
        ) : null}
      </ActionPanel>
    </main>
  );
}

function StatusPanel({
  title,
  message,
  tone,
  extraNote,
}: {
  title: string;
  message: string;
  tone: "success" | "warning" | "error";
  extraNote?: string | null;
}) {
  const color =
    tone === "success" ? "#15803d" : tone === "warning" ? "#b45309" : "#b91c1c";

  return (
    <ActionPanel>
      <TagoraLogo />
      <h1 className="section-title" style={{ marginBottom: 12, color }}>
        {title}
      </h1>
      <p style={{ margin: 0, lineHeight: 1.6, color: "#0f172a" }}>{message}</p>
      {extraNote ? (
        <p className="tagora-note" style={{ marginTop: 12, marginBottom: 0 }}>
          {extraNote}
        </p>
      ) : null}
    </ActionPanel>
  );
}

function ActionPanel({ children }: { children: React.ReactNode }) {
  return <ActionPanelInner>{children}</ActionPanelInner>;
}

function ActionPanelInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="tagora-panel" style={{ maxWidth: 480, width: "100%", margin: "0 auto" }}>
      {children}
    </div>
  );
}

function TagoraLogo() {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
          padding: "8px 14px",
          borderRadius: 10,
          background: "#1e3a5f",
          color: "#ffffff",
          fontWeight: 800,
          letterSpacing: "0.08em",
          fontSize: 14,
        }}
      >
        TAGORA Time
      </div>
    </div>
  );
}

function DetailRows({ rows }: { rows: AppActionTokenDetailRow[] }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label} className="tagora-panel-muted" style={{ padding: 12 }}>
          <div className="tagora-label">{row.label}</div>
          <div style={{ marginTop: 4, fontWeight: 600, lineHeight: 1.5 }}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function DecisionButtons({
  saving,
  rejectSelected,
  onAccept,
  onReject,
}: {
  saving: boolean;
  rejectSelected: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      <button
        type="button"
        className="tagora-dark-action"
        style={{
          width: "100%",
          minHeight: 52,
          fontSize: 17,
          fontWeight: 700,
        }}
        disabled={saving}
        onClick={onAccept}
      >
        {saving && !rejectSelected ? "Envoi en cours..." : "Accepter"}
      </button>
      <button
        type="button"
        className="tagora-dark-outline-action"
        style={{
          width: "100%",
          minHeight: 52,
          fontSize: 16,
          fontWeight: 600,
          borderColor: rejectSelected ? "#b91c1c" : undefined,
          outline: rejectSelected ? "2px solid #b91c1c" : undefined,
        }}
        disabled={saving}
        onClick={onReject}
      >
        Refuser
      </button>
    </div>
  );
}
