"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MentionEntityType =
  | "livraison"
  | "ramassage"
  | "blocage_journee"
  | "blocage_vehicule"
  | "blocage_remorque";

type MentionItem = {
  id: number;
  mentioned_name: string | null;
  mentioned_email: string | null;
  message: string;
  created_by_name: string | null;
  created_by_email: string | null;
  status: "envoye" | "lu" | "erreur_email" | "aucun_courriel";
  email_error?: string | null;
  email_provider_message_id?: string | null;
  created_at: string;
};

type RecipientOption = {
  id: string | number;
  name: string;
  email: string | null;
  active?: boolean | null;
  roleLabel?: string | null;
};

export default function InternalMentionsPanel(props: {
  entityType: MentionEntityType;
  entityId: string | number | null;
  recipients: RecipientOption[];
  context?: {
    title?: string;
    client?: string;
    adresse?: string;
    date?: string;
    heure?: string;
    statut?: string;
    dossier?: string;
    commande?: string;
    facture?: string;
    vehicule?: string;
    remorque?: string;
    chauffeur?: string;
    linkPath?: string;
  };
  className?: string;
}) {
  const entityId = props.entityId == null ? "" : String(props.entityId);
  const [items, setItems] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [notifyDirection, setNotifyDirection] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionEnd, setMentionEnd] = useState<number | null>(null);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [fallbackRecipients, setFallbackRecipients] = useState<RecipientOption[]>([]);
  const [loadingFallbackRecipients, setLoadingFallbackRecipients] = useState(false);
  const [manualRecipientChoice, setManualRecipientChoice] = useState("");
  const isSendingRef = useRef(false);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const hasValidEntity = entityId.trim().length > 0;

  const fetchMentions = useCallback(async () => {
    if (!hasValidEntity) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const url = `/api/internal-mentions?entityType=${encodeURIComponent(props.entityType)}&entityId=${encodeURIComponent(entityId)}`;
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        items?: MentionItem[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Chargement des mentions impossible.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Impossible de charger l historique des mentions.",
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, hasValidEntity, props.entityType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMentions();
  }, [fetchMentions]);

  function toggleRecipient(id: string | number) {
    const recipientId = String(id);
    setSelectedRecipientIds((current) =>
      current.includes(recipientId)
        ? current.filter((item) => item !== recipientId)
        : [...current, recipientId]
    );
  }

  function setRecipient(id: string | number) {
    const recipientId = String(id);
    setSelectedRecipientIds((current) =>
      current.includes(recipientId) ? current : [...current, recipientId]
    );
  }

  const sortedRecipients = useMemo(
    () => [...props.recipients].sort((a, b) => a.name.localeCompare(b.name, "fr-CA")),
    [props.recipients]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadFallbackRecipients() {
      if (sortedRecipients.length > 0) {
        setFallbackRecipients([]);
        return;
      }
      setLoadingFallbackRecipients(true);
      try {
        const response = await fetch("/api/internal-mentions/mentionable-employees", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          recipients?: Array<{
            id: string | number;
            name: string;
            email?: string | null;
            roleLabel?: string | null;
            active?: boolean;
          }>;
          error?: string;
        };
        console.info("InternalMentionsPanel fallback response:", payload);
        if (cancelled) return;
        const normalized = Array.isArray(payload.recipients)
          ? payload.recipients
              .map((item) => {
                const id = String(item.id ?? "").trim();
                if (!id) return null;
                return {
                  id,
                  name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Interne ${id}`,
                  email: typeof item.email === "string" && item.email.trim() ? item.email.trim() : null,
                  roleLabel:
                    typeof item.roleLabel === "string" && item.roleLabel.trim()
                      ? item.roleLabel.trim()
                      : null,
                  active: item.active !== false,
                } satisfies RecipientOption;
              })
              .filter((item): item is NonNullable<typeof item> => item !== null)
          : [];
        setFallbackRecipients(normalized);
      } catch {
        if (!cancelled) setFallbackRecipients([]);
      } finally {
        if (!cancelled) setLoadingFallbackRecipients(false);
      }
    }
    void loadFallbackRecipients();
    return () => {
      cancelled = true;
    };
  }, [sortedRecipients.length]);

  const mergedRecipients = useMemo(() => {
    const map = new Map<string, RecipientOption>();
    [...sortedRecipients, ...fallbackRecipients].forEach((item) => {
      const recipientId = String(item.id ?? "").trim();
      if (!recipientId) return;
      map.set(recipientId, {
        id: recipientId,
        name: item.name,
        email: item.email ?? null,
        roleLabel: item.roleLabel ?? null,
        active: item.active !== false,
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "fr-CA"));
  }, [fallbackRecipients, sortedRecipients]);

  const activeRecipients = useMemo(
    () => mergedRecipients.filter((item) => item.active !== false),
    [mergedRecipients]
  );

  useEffect(() => {
    console.info("InternalMentionsPanel recipients loaded:", activeRecipients.length);
  }, [activeRecipients.length]);

  useEffect(() => {
    console.info(
      "InternalMentionsPanel recipients normalized:",
      activeRecipients.slice(0, 10).map((item) => ({
        id: String(item.id),
        name: item.name,
        email: item.email,
        roleLabel: item.roleLabel ?? null,
      }))
    );
  }, [activeRecipients]);

  const selectedRecipients = useMemo(
    () => activeRecipients.filter((item) => selectedRecipientIds.includes(String(item.id))),
    [activeRecipients, selectedRecipientIds]
  );

  const selectedRecipientsForSend = useMemo(
    () =>
      selectedRecipients.map((item) => ({
        id: String(item.id),
        name: item.name,
        email: item.email ?? null,
        roleLabel: item.roleLabel ?? null,
      })),
    [selectedRecipients]
  );

  const mentionSuggestions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return activeRecipients.slice(0, 8);
    return activeRecipients
      .filter((item) => {
        const haystack = `${item.name} ${item.email ?? ""} ${item.roleLabel ?? ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [activeRecipients, mentionQuery]);

  function updateMentionState(nextMessage: string, caret: number) {
    const before = nextMessage.slice(0, caret);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (!match) {
      setMentionMenuOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      setMentionEnd(null);
      setHighlightedIndex(0);
      return;
    }
    const query = match[2] ?? "";
    const atPos = before.length - query.length - 1;
    setMentionMenuOpen(true);
    setMentionQuery(query);
    setMentionStart(atPos);
    setMentionEnd(caret);
    setHighlightedIndex(0);
  }

  function handleMessageChange(value: string, caret: number) {
    setMessage(value);
    updateMentionState(value, caret);
  }

  function selectMentionRecipient(recipient: RecipientOption) {
    const start = mentionStart;
    const end = mentionEnd;
    const textarea = messageRef.current;
    if (start == null || end == null || !textarea) {
      setRecipient(recipient.id);
      return;
    }
    const mentionText = `@${recipient.name} `;
    const nextMessage = `${message.slice(0, start)}${mentionText}${message.slice(end)}`;
    const nextCaret = start + mentionText.length;
    setMessage(nextMessage);
    setRecipient(recipient.id);
    setMentionMenuOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionEnd(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  useEffect(() => {
    if (!mentionMenuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMenuCoords(null);
      return;
    }
    function updateCoords() {
      const textarea = messageRef.current;
      if (!textarea) return;
      const rect = textarea.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [mentionMenuOpen, mentionQuery, message]);

  async function sendMention() {
    if (isSendingRef.current || saving) {
      return;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFeedback({ type: "error", text: "Le message est requis." });
      return;
    }
    if (selectedRecipientIds.length === 0 && !notifyDirection) {
      setFeedback({
        type: "error",
        text: "Veuillez mentionner au moins un employe avec @ ou selectionner un groupe a aviser.",
      });
      return;
    }
    if (!hasValidEntity) {
      setFeedback({ type: "error", text: "Element invalide pour ajouter une mention." });
      return;
    }

    setSaving(true);
    isSendingRef.current = true;
    setFeedback(null);
    try {
      const emails = selectedRecipientsForSend
        .map((item) => (typeof item.email === "string" ? item.email.trim().toLowerCase() : ""))
        .filter(Boolean);
      console.info("InternalMentionsPanel selected recipients for send:", selectedRecipientsForSend);
      console.info("InternalMentionsPanel send payload:", {
        message: trimmedMessage,
        selectedRecipientIds,
        selectedRecipientsForSend,
        emails,
      });
      const response = await fetch("/api/internal-mentions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: props.entityType,
          entityId,
          recipientIds: selectedRecipientIds,
          selectedRecipientsForSend,
          recipientGroup: notifyDirection ? "direction" : undefined,
          message: trimmedMessage,
          context: props.context,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Envoi de la mention impossible.");
      setFeedback({ type: "success", text: payload.message || "Mention interne envoyee." });
      setMessage("");
      setSelectedRecipientIds([]);
      setNotifyDirection(false);
      setMentionMenuOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      setMentionEnd(null);
      await fetchMentions();
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Impossible d envoyer la mention.",
      });
    } finally {
      setSaving(false);
      isSendingRef.current = false;
    }
  }

  return (
    <section className={props.className ?? "tagora-panel"} style={{ marginTop: 14 }}>
      <h3 className="section-title" style={{ marginBottom: 10 }}>
        Avis internes / Mentions
      </h3>
      <p className="tagora-note" style={{ marginTop: 0 }}>
        Laissez une note interne et avisez les personnes concernees.
      </p>

      <div className="tagora-panel-muted" style={{ padding: 14, display: "grid", gap: 10 }}>
        <div className="tagora-label">Personnes a aviser</div>

        {activeRecipients.length === 0 ? (
          <p className="tagora-note" style={{ margin: 0 }}>
            {loadingFallbackRecipients
              ? "Chargement des employes actifs..."
              : "Aucun employe actif disponible."}
          </p>
        ) : selectedRecipients.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {selectedRecipients.map((item) => (
              <span
                key={item.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  background: "#ffffff",
                }}
              >
                <span>{item.name}</span>
                <button
                  type="button"
                  onClick={() => toggleRecipient(item.id)}
                  disabled={saving}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#64748b",
                    padding: 0,
                  }}
                  aria-label={`Retirer ${item.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="tagora-note" style={{ margin: 0 }}>
            Ecrivez @ dans le message pour mentionner un employe actif.
          </p>
        )}

        {activeRecipients.length > 0 ? (
          <label className="tagora-field" style={{ marginBottom: 0 }}>
            <span className="tagora-label">Choisir une personne a aviser</span>
            <select
              className="tagora-input"
              value={manualRecipientChoice}
              onChange={(event) => {
                const value = event.target.value;
                setManualRecipientChoice(value);
                if (!value) return;
                setRecipient(value);
                setManualRecipientChoice("");
              }}
              disabled={saving}
            >
              <option value="">Destinataire...</option>
              {activeRecipients.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name} {item.email ? `- ${item.email}` : "- Aucun courriel"}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {process.env.NODE_ENV === "development" ? (
          <p className="tagora-note" style={{ margin: 0, fontSize: 11 }}>
            Recipients charges : {activeRecipients.length}
          </p>
        ) : null}

        <label className="account-requests-permission-option">
          <input
            type="checkbox"
            checked={notifyDirection}
            onChange={(event) => setNotifyDirection(event.target.checked)}
            disabled={saving}
          />
          <span>Aviser tous les cadres direction/admin</span>
        </label>

        <label className="tagora-field" style={{ marginBottom: 0 }}>
          <span className="tagora-label">Message</span>
          <div style={{ position: "relative" }}>
            <textarea
              ref={messageRef}
              className="tagora-textarea"
              value={message}
              onChange={(event) =>
                handleMessageChange(event.target.value, event.target.selectionStart ?? event.target.value.length)
              }
              onClick={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
              onKeyUp={(event) => updateMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
              onKeyDown={(event) => {
                if (!mentionMenuOpen) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedIndex((current) =>
                    mentionSuggestions.length === 0 ? 0 : (current + 1) % mentionSuggestions.length
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedIndex((current) =>
                    mentionSuggestions.length === 0
                      ? 0
                      : (current - 1 + mentionSuggestions.length) % mentionSuggestions.length
                  );
                } else if (event.key === "Enter") {
                  if (mentionSuggestions.length > 0) {
                    event.preventDefault();
                    selectMentionRecipient(mentionSuggestions[Math.min(highlightedIndex, mentionSuggestions.length - 1)]);
                  }
                } else if (event.key === "Escape") {
                  setMentionMenuOpen(false);
                }
              }}
              placeholder="Ecrivez @ pour mentionner un employe..."
              rows={3}
              disabled={saving}
            />
            {mentionMenuOpen && mentionSuggestions.length > 0 && menuCoords && typeof document !== "undefined"
              ? createPortal(
                  <div
                    style={{
                      position: "fixed",
                      top: menuCoords.top,
                      left: menuCoords.left,
                      width: menuCoords.width,
                      zIndex: 9999,
                      border: "1px solid #cbd5e1",
                      borderRadius: 10,
                      background: "#ffffff",
                      boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {mentionSuggestions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectMentionRecipient(item)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: index === highlightedIndex ? "#eff6ff" : "#ffffff",
                          padding: "10px 12px",
                          cursor: "pointer",
                          display: "grid",
                          gap: 2,
                        }}
                      >
                        <strong style={{ fontSize: 13 }}>{item.name}</strong>
                        <span className="ui-text-muted" style={{ fontSize: 12 }}>
                          {item.email || "Aucun courriel"}
                          {item.roleLabel ? ` • ${item.roleLabel}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>,
                  document.body
                )
              : null}
          </div>
        </label>

        <div className="actions-row">
          <button type="button" className="tagora-dark-action" onClick={() => void sendMention()} disabled={saving}>
            {saving ? "Envoi..." : "Envoyer"}
          </button>
          <button type="button" className="tagora-dark-outline-action" onClick={() => void fetchMentions()} disabled={loading}>
            {loading ? "Actualisation..." : "Actualiser historique"}
          </button>
        </div>

        {feedback ? (
          <div className={feedback.type === "error" ? "ui-status-danger" : "ui-status-success"}>{feedback.text}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div className="tagora-label">Historique</div>
        {items.length === 0 ? (
          <p className="tagora-note" style={{ margin: 0 }}>
            Aucune mention pour cet element.
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="tagora-panel-muted" style={{ padding: 12, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{item.mentioned_name || item.mentioned_email || "Destinataire"}</strong>
                <span className="ui-text-muted">{new Date(item.created_at).toLocaleString("fr-CA")}</span>
              </div>
              <div className="ui-text-muted">
                Envoye par {item.created_by_name || item.created_by_email || "Utilisateur"}
              </div>
              <div className="ui-text-muted">
                Destinataire : {(item.mentioned_name || "Destinataire")}{" "}
                {item.mentioned_email ? `<${item.mentioned_email}>` : "(Aucun courriel)"}
              </div>
              <div className="ui-text-muted">
                Statut : {item.status}
                {item.email_error ? ` | Erreur : ${item.email_error}` : ""}
                {item.email_provider_message_id ? ` | Message ID : ${item.email_provider_message_id}` : ""}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{item.message}</div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
