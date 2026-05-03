"use client";

import { useCallback, useEffect, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import TagoraCollapsibleSection from "@/app/components/TagoraCollapsibleSection";
import { supabase } from "@/app/lib/supabase/client";
import {
  EMPLOYEE_LEAVE_TYPES,
  publicLeaveTypeLabelFr,
} from "@/app/lib/employee-leave-period.shared";

type PeriodRow = {
  id: string;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string | null;
  expected_return_date: string | null;
  is_indefinite: boolean;
  status: string;
  reason_public: string | null;
  private_note: string | null;
};

export default function EmployeeLongLeaveSection({ employeeId }: { employeeId: number }) {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  const [leaveType, setLeaveType] = useState<string>("sick_leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const [reasonPublic, setReasonPublic] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/direction/ressources/employes/${employeeId}/leave-periods`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = (await res.json()) as { periods?: PeriodRow[] };
      setPeriods(Array.isArray(j.periods) ? j.periods : []);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = periods.find((p) => p.status === "active") ?? null;

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate.trim()) {
      setMessage("Indiquez une date de début.");
      setMessageType("error");
      return;
    }
    setSaving(true);
    setMessage("");
    setMessageType(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/direction/ressources/employes/${employeeId}/leave-periods`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate.trim() || null,
          expected_return_date: indefinite ? null : expectedReturn.trim() || null,
          is_indefinite: indefinite,
          reason_public: reasonPublic.trim() || null,
          private_note: privateNote.trim() || null,
          notify_employee: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof j.error === "string" ? j.error : "Erreur.");
        setMessageType("error");
        return;
      }
      setMessage("Congé prolongé enregistré.");
      setMessageType("success");
      setStartDate("");
      setEndDate("");
      setExpectedReturn("");
      setIndefinite(false);
      setReasonPublic("");
      setPrivateNote("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patchPeriod(periodId: string, action: "end" | "cancel") {
    const ok =
      action === "end"
        ? window.confirm("Marquer le retour au travail pour cette période ?")
        : window.confirm("Annuler cette période de congé ?");
    if (!ok) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/direction/employee-leave-periods/${periodId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof j.error === "string" ? j.error : "Action impossible.");
        setMessageType("error");
        return;
      }
      setMessage(action === "end" ? "Retour au travail enregistré." : "Période annulée.");
      setMessageType("success");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <TagoraCollapsibleSection
      sectionId="employee-long-leave"
      title="Statut de travail / Congé prolongé"
      subtitle="Absence longue durée : l’employé reste actif portail mais n’est pas disponible aux effectifs. Les détails médicaux restent dans la note interne uniquement."
      open={sectionOpen}
      onOpenChange={setSectionOpen}
    >
      {message ? (
        <FeedbackMessage
          message={message}
          type={messageType === "success" ? "success" : "error"}
        />
      ) : null}

      {loading ? (
        <p className="tagora-note">Chargement…</p>
      ) : active ? (
        <div
          className="tagora-panel-muted"
          style={{ padding: 16, marginBottom: 16 }}
        >
          <div className="tagora-label">Congé actif</div>
          <p style={{ margin: "8px 0 0", fontWeight: 700 }}>
            {publicLeaveTypeLabelFr(active.leave_type)} — depuis le {active.start_date}
            {active.is_indefinite || !active.expected_return_date
              ? " — retour indéterminé"
              : ` — retour prévu : ${active.expected_return_date}`}
          </p>
          {active.reason_public ? (
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>{active.reason_public}</p>
          ) : null}
          {active.private_note ? (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
              Note interne : {active.private_note}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ui-button ui-button-primary"
              disabled={saving}
              onClick={() => void patchPeriod(active.id, "end")}
            >
              Marquer retour au travail
            </button>
            <button
              type="button"
              className="ui-button ui-button-secondary"
              disabled={saving}
              onClick={() => void patchPeriod(active.id, "cancel")}
            >
              Annuler le congé
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submitCreate} className="tagora-form-grid">
          <label className="tagora-field">
            <span className="tagora-label">Type</span>
            <select
              className="tagora-input"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              {EMPLOYEE_LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {publicLeaveTypeLabelFr(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Date de début</span>
            <input
              className="tagora-input"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="tagora-field">
            <span className="tagora-label">Date de fin (optionnel)</span>
            <input
              className="tagora-input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">
              <input
                type="checkbox"
                checked={indefinite}
                onChange={(e) => setIndefinite(e.target.checked)}
              />{" "}
              Retour indéterminé
            </span>
          </label>
          {!indefinite ? (
            <label className="tagora-field">
              <span className="tagora-label">Retour prévu (premier jour au travail)</span>
              <input
                className="tagora-input"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
              />
            </label>
          ) : null}
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Motif affichable (optionnel)</span>
            <input
              className="tagora-input"
              value={reasonPublic}
              onChange={(e) => setReasonPublic(e.target.value)}
              placeholder="Sans détail médical"
            />
          </label>
          <label className="tagora-field" style={{ gridColumn: "1 / -1" }}>
            <span className="tagora-label">Note interne (direction)</span>
            <textarea
              className="tagora-textarea"
              rows={2}
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value)}
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              className="ui-button ui-button-primary"
              disabled={saving}
            >
              Mettre en congé prolongé
            </button>
          </div>
        </form>
      )}

      {periods.filter((p) => p.status !== "active").length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <div className="tagora-label">Historique récent</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#64748b", fontSize: "0.88rem" }}>
            {periods
              .filter((p) => p.status !== "active")
              .slice(0, 8)
              .map((p) => (
                <li key={p.id}>
                  {p.start_date} → {p.status} ({publicLeaveTypeLabelFr(p.leave_type)})
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </TagoraCollapsibleSection>
  );
}
