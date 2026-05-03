"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraCountBadge from "@/app/components/TagoraCountBadge";

type SummaryPayload = {
  open?: {
    accountRequests?: number;
    improvements?: number;
    effectifsScheduleRequests?: number;
    sum?: number;
    phase2OpenSum?: number;
  };
  failed?: {
    total?: number;
    smsOrEmail?: number;
    journal?: number;
    smsLog?: number;
    internalMentionEmail?: number;
  };
  criticalUntreated?: { total?: number };
  badgeTotal?: number;
  phase2?: {
    queues?: Array<{
      id: string;
      label: string;
      description: string;
      href: string;
      count: number;
      priority: "critical" | "high" | "medium" | "low";
      category: string;
      source: "journal" | "derived";
    }>;
    appAlertsOpen?: number;
    appAlertsFailed?: number;
  };
};

type QueueRow = {
  id: string;
  label: string;
  description: string;
  href: string;
  count: number;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  source?: "journal" | "derived" | "phase1";
};

type JournalItem = {
  id: string;
  createdAt: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  message: string | null;
  employeeLabel: string;
  employeeId: number | null;
  companyKey: string | null;
  emailDelivery: string;
  smsDelivery: string;
  linkHref: string | null;
  sourceModule: string;
  handledAt: string | null;
  dedupeKey?: string | null;
  failureCount?: number | null;
};

const JOURNAL_STATUS_LABEL: Record<string, string> = {
  open: "Ouverte",
  failed: "Échec technique",
  handled: "Traitée",
  archived: "Archivée",
  cancelled: "Annulée",
  snoozed: "Reportée",
};

type JournalFilter = "actionable" | "open" | "failed" | "handled" | "archived" | "cancelled" | "all";

function journalFilterLabel(f: JournalFilter): string {
  switch (f) {
    case "actionable":
      return "Ouvertes + échecs techniques";
    case "open":
      return "Ouvertes";
    case "failed":
      return "Échecs techniques";
    case "handled":
      return "Traitées";
    case "archived":
      return "Archivées";
    case "cancelled":
      return "Annulées";
    case "all":
      return "Toutes";
    default:
      return f;
  }
}

const CATEGORY_ORDER = [
  "Comptes",
  "Employés",
  "Effectifs",
  "Horodateur",
  "Livraisons / Ramassages",
  "Dépenses",
  "Refacturation Titan",
  "Améliorations",
  "Système",
] as const;

function priorityRank(p: QueueRow["priority"]): number {
  switch (p) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityBadgeStyle(p: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
    textTransform: "uppercase" as const,
    padding: "4px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  };
  switch (p) {
    case "critical":
      return { ...base, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" };
    case "high":
      return { ...base, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" };
    case "medium":
      return { ...base, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
    case "low":
    default:
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
  }
}

function statusBadgeStyle(status: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 8,
    whiteSpace: "nowrap",
  };
  switch (status) {
    case "open":
      return { ...base, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" };
    case "failed":
      return { ...base, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
    case "handled":
      return { ...base, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
    case "archived":
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
    case "cancelled":
      return { ...base, background: "#fafafa", color: "#737373", border: "1px solid #e5e5e5" };
    default:
      return { ...base, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" };
  }
}

const JOURNAL_FILTERS: { key: JournalFilter; label: string }[] = [
  { key: "actionable", label: "Ouvertes + échecs" },
  { key: "open", label: "Ouvertes" },
  { key: "failed", label: "Échecs techniques" },
  { key: "handled", label: "Traitées" },
  { key: "archived", label: "Archivées" },
  { key: "cancelled", label: "Annulées" },
  { key: "all", label: "Toutes" },
];

const acScopedCss = `
  .ac-details-reset > summary { list-style: none; }
  .ac-details-reset > summary::-webkit-details-marker { display: none; }
  .ac-msg-clamp {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  @media (max-width: 720px) {
    .ac-alert-top-row { flex-direction: column !important; align-items: stretch !important; }
    .ac-alert-actions-col { align-items: stretch !important; min-width: 0 !important; width: 100%; }
    .ac-alert-actions-col > div { justify-content: flex-start !important; flex-wrap: wrap; }
    .ac-alert-details details { width: 100%; }
    .ac-alert-details summary { width: 100%; text-align: center; }
  }
`;

const ALERT_CENTER_CARD_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 16,
  width: "100%",
};

function alertCenterStatCardSurface(tone: "default" | "warn" | "danger" | "muted"): CSSProperties {
  const border =
    tone === "danger"
      ? "1px solid #fecaca"
      : tone === "warn"
        ? "1px solid #fde68a"
        : tone === "muted"
          ? "1px solid #e2e8f0"
          : "1px solid #e2e8f0";
  const shadow =
    tone === "danger"
      ? "0 4px 20px rgba(185, 28, 28, 0.08)"
      : "0 2px 12px rgba(15, 23, 42, 0.06)";
  return {
    borderRadius: 16,
    border,
    background: "#fff",
    boxShadow: shadow,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 112,
    justifyContent: "center",
  };
}

export default function AlertCenterDirectionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "open";
  const journalFilter = (searchParams.get("journal") ?? "actionable") as JournalFilter;
  const { user, loading: accessLoading, role } = useCurrentAccess();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryFetched, setSummaryFetched] = useState(false);
  const [journalItems, setJournalItems] = useState<JournalItem[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalMutatingId, setJournalMutatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading || !user) {
      return;
    }
    if (role !== "admin" && role !== "direction") {
      setSummaryFetched(true);
      router.replace("/direction/dashboard");
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) return;
        const authHeaders = { Authorization: `Bearer ${session.access_token}` };
        setJournalLoading(true);
        const journalQuery =
          journalFilter === "actionable"
            ? "journal=actionable"
            : `journal=${encodeURIComponent(journalFilter)}`;
        const [sumRes, journalRes] = await Promise.all([
          fetch("/api/direction/alert-center/summary", {
            headers: authHeaders,
            signal: ac.signal,
          }),
          fetch(`/api/direction/alert-center/journal?${journalQuery}`, {
            headers: authHeaders,
            signal: ac.signal,
          }),
        ]);
        if (cancelled) return;
        if (sumRes.ok) {
          setSummary((await sumRes.json()) as SummaryPayload);
        } else {
          setSummary(null);
        }
        if (journalRes.ok) {
          const j = (await journalRes.json()) as { items?: JournalItem[] };
          setJournalItems(Array.isArray(j.items) ? j.items : []);
        } else {
          setJournalItems([]);
        }
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) {
          return;
        }
        setSummary(null);
        setJournalItems([]);
      } finally {
        if (!cancelled) {
          setSummaryFetched(true);
          setJournalLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [accessLoading, user, role, router, journalFilter]);

  const refreshSummary = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const sumRes = await fetch("/api/direction/alert-center/summary", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (sumRes.ok) {
      setSummary((await sumRes.json()) as SummaryPayload);
    }
  }, []);

  const refreshJournalList = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const journalQuery =
      journalFilter === "actionable"
        ? "journal=actionable"
        : `journal=${encodeURIComponent(journalFilter)}`;
    const journalRes = await fetch(`/api/direction/alert-center/journal?${journalQuery}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (journalRes.ok) {
      const j = (await journalRes.json()) as { items?: JournalItem[] };
      setJournalItems(Array.isArray(j.items) ? j.items : []);
    }
  }, [journalFilter]);

  async function patchJournalAction(alertId: string, action: "mark_handled" | "archive" | "cancel") {
    try {
      setJournalMutatingId(alertId);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/direction/alert-center/journal/${alertId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await refreshJournalList();
        await refreshSummary();
      }
    } finally {
      setJournalMutatingId(null);
    }
  }

  async function deleteJournalRow(alertId: string) {
    if (
      !window.confirm(
        "Supprimer définitivement cette alerte ? Les alertes critiques ne peuvent pas être supprimées."
      )
    ) {
      return;
    }
    try {
      setJournalMutatingId(alertId);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/direction/alert-center/journal/${alertId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        await refreshJournalList();
        await refreshSummary();
      }
    } finally {
      setJournalMutatingId(null);
    }
  }

  async function runBulkAction(action: string) {
    try {
      setBulkBusy(action);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/direction/alert-center/journal/bulk", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await refreshJournalList();
        await refreshSummary();
      }
    } finally {
      setBulkBusy(null);
    }
  }

  useEffect(() => {
    if (accessLoading || user) {
      return;
    }
    router.replace("/direction/login");
  }, [accessLoading, user, router]);

  const queuesPhase1 = useMemo((): QueueRow[] => {
    const o = summary?.open;
    const rows: QueueRow[] = [
      {
        id: "effectifs-schedule",
        label: "Demandes d'horaire à approuver",
        description: "Effectifs — demandes en attente de validation.",
        href: "/direction/effectifs",
        count: o?.effectifsScheduleRequests ?? 0,
        priority: "high",
        category: "Effectifs",
        source: "phase1",
      },
      {
        id: "accounts-pending",
        label: "Demandes de compte en attente",
        description: "Comptes — création ou accès à traiter.",
        href: "/direction/demandes-comptes",
        count: o?.accountRequests ?? 0,
        priority: "medium",
        category: "Comptes",
        source: "phase1",
      },
      {
        id: "improvements",
        label: "Améliorations à traiter",
        description: "Suggestions et suivis internes.",
        href: "/ameliorations",
        count: o?.improvements ?? 0,
        priority: "medium",
        category: "Améliorations",
        source: "phase1",
      },
    ];
    const sorted = [...rows].sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return b.count - a.count;
    });
    if (statusFilter === "open") {
      return sorted.filter((r) => r.count > 0);
    }
    return sorted;
  }, [summary, statusFilter]);

  const queuesPhase2 = useMemo((): QueueRow[] => {
    const raw = summary?.phase2?.queues ?? [];
    const rows: QueueRow[] = raw.map((q) => ({
      id: q.id,
      label: q.label,
      description: q.description,
      href: q.href,
      count: q.count,
      priority: q.priority,
      category: q.category,
      source: q.source,
    }));
    const sorted = [...rows].sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return b.count - a.count;
    });
    if (statusFilter === "open") {
      return sorted.filter((r) => r.count > 0);
    }
    return sorted;
  }, [summary?.phase2?.queues, statusFilter]);

  const queues = useMemo(() => [...queuesPhase1, ...queuesPhase2], [queuesPhase1, queuesPhase2]);

  const categories = useMemo(() => {
    const map = new Map<string, QueueRow[]>();
    for (const row of queues) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return map;
  }, [queues]);

  const roleOk = role === "admin" || role === "direction";
  const showLoader = accessLoading || (Boolean(user) && roleOk && !summaryFetched);

  const badgeTotal = summary?.badgeTotal ?? 0;
  const appAlertsFailed = summary?.phase2?.appAlertsFailed ?? 0;
  const failedDeliveries = summary?.failed?.journal ?? 0;
  const techFailureSum = appAlertsFailed + failedDeliveries;
  const critical = summary?.criticalUntreated?.total ?? 0;

  if (showLoader) {
    return (
      <TagoraLoadingScreen isLoading message="Chargement du centre d'alertes..." fullScreen />
    );
  }

  if (!user || !roleOk) {
    return null;
  }

  return (
    <main className="tagora-app-shell">
      <style dangerouslySetInnerHTML={{ __html: acScopedCss }} />
      <div className="tagora-app-content ui-stack-lg" style={{ maxWidth: 1120, margin: "0 auto" }}>
        <AuthenticatedPageHeader
          title="Centre d'alertes"
          subtitle="Surveillance des alertes système, horodateur, notifications et sécurité."
          showNavigation={false}
          actions={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="ui-button ui-button-primary" href="/direction/alertes/communications">
                Communications
              </Link>
              <Link className="ui-button ui-button-secondary" href="/direction/dashboard">
                Tableau de bord
              </Link>
            </div>
          }
        />

        {/* Résumé — cartes */}
        <section aria-label="Résumé du centre d'alertes" style={ALERT_CENTER_CARD_GRID}>
          <div style={alertCenterStatCardSurface("default")}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>À traiter</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
              {badgeTotal}
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Vue globale (badge agrégé)</span>
          </div>
          <div style={alertCenterStatCardSurface("warn")}>
            <span style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>Échecs techniques</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#c2410c", letterSpacing: "-0.03em" }}>
              {techFailureSum}
            </span>
            <span style={{ fontSize: 12, color: "#b45309" }}>
              Journal échec + livraisons techniques liées
            </span>
          </div>
          <div style={alertCenterStatCardSurface("danger")}>
            <span style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>Critiques</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#b91c1c", letterSpacing: "-0.03em" }}>
              {critical}
            </span>
            <span style={{ fontSize: 12, color: "#991b1b" }}>Alertes critiques non traitées</span>
          </div>
          <div style={alertCenterStatCardSurface("muted")}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Dans cette liste</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: "#334155", letterSpacing: "-0.03em" }}>
              {journalLoading ? "…" : journalItems.length}
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{journalFilterLabel(journalFilter)}</span>
          </div>
        </section>

        {/* Filtre files phase 1 (conservé) */}
        <AppCard
          className="ui-stack-sm"
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 8px rgba(15,23,42,0.04)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600, color: "#334155", fontSize: 14 }}>Files métier</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                href={`/direction/alertes?status=open&journal=${journalFilter}`}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: statusFilter === "open" ? "#ecfdf5" : "#f8fafc",
                  color: statusFilter === "open" ? "#047857" : "#64748b",
                  fontWeight: statusFilter === "open" ? 600 : 500,
                  border: statusFilter === "open" ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                  textDecoration: "none",
                }}
              >
                Ouvertes seulement
              </Link>
              <Link
                href={`/direction/alertes?status=all&journal=${journalFilter}`}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: statusFilter === "all" ? "#eff6ff" : "#f8fafc",
                  color: statusFilter === "all" ? "#1d4ed8" : "#64748b",
                  fontWeight: statusFilter === "all" ? 600 : 500,
                  border: statusFilter === "all" ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                  textDecoration: "none",
                }}
              >
                Toutes les files
              </Link>
            </div>
          </div>
        </AppCard>

        {/* Journal — filtres pills */}
        <SectionCard
          title="Journal des alertes"
          subtitle="Filtrez par statut, traitez ou archivez sans quitter la page."
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
              paddingBottom: 4,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
            role="tablist"
            aria-label="Filtre du journal"
          >
            {JOURNAL_FILTERS.map(({ key, label }) => {
              const active = journalFilter === key;
              return (
                <Link
                  key={key}
                  href={`/direction/alertes?journal=${key}&status=${statusFilter}`}
                  scroll={false}
                  style={{
                    flex: "0 0 auto",
                    fontSize: 13,
                    padding: "9px 16px",
                    borderRadius: 999,
                    fontWeight: active ? 700 : 500,
                    textDecoration: "none",
                    color: active ? "#0f766e" : "#475569",
                    background: active ? "#ccfbf1" : "#fff",
                    border: active ? "2px solid #14b8a6" : "1px solid #e2e8f0",
                    boxShadow: active ? "0 2px 8px rgba(20, 184, 166, 0.15)" : "none",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Actions rapides */}
          <AppCard
            tone="muted"
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              marginBottom: 24,
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, marginBottom: 14 }}>
              Actions rapides
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "stretch",
              }}
            >
              <button
                type="button"
                className="ui-button ui-button-primary"
                style={{ fontSize: 13, padding: "10px 16px", borderRadius: 10 }}
                disabled={bulkBusy !== null}
                onClick={() => void runBulkAction("mark_all_open_handled")}
              >
                {bulkBusy === "mark_all_open_handled" ? "…" : "Tout marquer traité"}
              </button>
              <button
                type="button"
                className="ui-button ui-button-secondary"
                style={{ fontSize: 13, padding: "10px 16px", borderRadius: 10 }}
                disabled={bulkBusy !== null}
                onClick={() => void runBulkAction("archive_resend_403_notification_failures")}
              >
                {bulkBusy === "archive_resend_403_notification_failures" ? "…" : "Archiver Resend 403"}
              </button>
              <button
                type="button"
                className="ui-button ui-button-secondary"
                style={{ fontSize: 13, padding: "10px 16px", borderRadius: 10 }}
                disabled={bulkBusy !== null}
                onClick={() => void runBulkAction("archive_old_mfa_system_noise")}
              >
                {bulkBusy === "archive_old_mfa_system_noise" ? "…" : "Archiver bruit MFA"}
              </button>
            </div>
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px dashed #cbd5e1",
              }}
            >
              <button
                type="button"
                disabled={bulkBusy !== null}
                onClick={() => void runBulkAction("cleanup_test_alerts")}
                style={{
                  fontSize: 13,
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #fcd34d",
                  background: "#fffbeb",
                  color: "#92400e",
                  fontWeight: 600,
                  cursor: bulkBusy ? "not-allowed" : "pointer",
                  opacity: bulkBusy ? 0.6 : 1,
                }}
              >
                {bulkBusy === "cleanup_test_alerts" ? "…" : "Nettoyer les alertes de test"}
              </button>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#78716c", maxWidth: 520 }}>
                Regroupe l’archivage des erreurs Resend 403 connues et du bruit MFA ancien. Action à
                utiliser avec discernement.
              </p>
            </div>
          </AppCard>

          {journalLoading ? (
            <p style={{ color: "#64748b", margin: 0 }}>Chargement du journal…</p>
          ) : journalItems.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "#64748b",
                background: "#f8fafc",
                borderRadius: 14,
                border: "1px dashed #cbd5e1",
              }}
            >
              Aucune entrée pour « {journalFilterLabel(journalFilter)} ».
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {journalItems.map((row) => {
                const statusFr = JOURNAL_STATUS_LABEL[row.status] ?? row.status;
                const fc = row.failureCount;
                const showRepeat =
                  typeof fc === "number" && fc > 1 ? `Répété ${fc - 1} fois` : null;
                const busy = journalMutatingId === row.id;
                const canHandle = row.status === "open" || row.status === "failed";
                const canArchive =
                  row.status === "open" ||
                  row.status === "failed" ||
                  row.status === "handled" ||
                  row.status === "snoozed";
                const isCritical = row.priority === "critical";
                const expanded = expandedMessageId === row.id;

                return (
                  <li key={row.id}>
                    <article
                      style={{
                        borderRadius: 16,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        boxShadow: "0 2px 14px rgba(15, 23, 42, 0.05)",
                        padding: "18px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      <div
                        className="ac-alert-top-row"
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 16,
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                            <span style={statusBadgeStyle(row.status)}>{statusFr}</span>
                            <span style={priorityBadgeStyle(row.priority)}>{row.priority}</span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                padding: "4px 8px",
                                background: "#f1f5f9",
                                borderRadius: 6,
                              }}
                            >
                              {row.category}
                            </span>
                          </div>
                          <h3
                            style={{
                              margin: "0 0 8px",
                              fontSize: 17,
                              fontWeight: 700,
                              color: "#0f172a",
                              lineHeight: 1.35,
                            }}
                          >
                            {row.title}
                          </h3>
                          {row.message ? (
                            <div>
                              <p
                                className={expanded ? undefined : "ac-msg-clamp"}
                                style={{
                                  margin: 0,
                                  fontSize: 14,
                                  color: "#475569",
                                  lineHeight: 1.55,
                                  whiteSpace: expanded ? "pre-wrap" : undefined,
                                }}
                              >
                                {row.message}
                              </p>
                              {row.message.length > 140 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMessageId(expanded ? null : row.id)
                                  }
                                  style={{
                                    marginTop: 6,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#0d9488",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  {expanded ? "Réduire" : "Voir détail"}
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>Aucun message.</p>
                          )}
                        </div>

                        <div
                          className="ac-alert-actions-col"
                          style={{
                            flex: "0 0 auto",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 10,
                            minWidth: 200,
                          }}
                        >
                          <div
                            className="ac-alert-details"
                            style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}
                          >
                            {row.linkHref ? (
                              <Link
                                href={row.linkHref}
                                className="ui-button ui-button-primary"
                                style={{ fontSize: 13, padding: "8px 14px", borderRadius: 10 }}
                              >
                                Ouvrir
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className="ui-button ui-button-secondary"
                              style={{
                                fontSize: 13,
                                padding: "8px 14px",
                                borderRadius: 10,
                                fontWeight: 600,
                              }}
                              disabled={busy || !canHandle}
                              onClick={() => void patchJournalAction(row.id, "mark_handled")}
                            >
                              {busy ? "…" : "Traité"}
                            </button>
                            <details className="ac-details-reset" style={{ position: "relative" }}>
                              <summary
                                style={{
                                  listStyle: "none",
                                  cursor: "pointer",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  padding: "8px 14px",
                                  borderRadius: 10,
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  color: "#334155",
                                }}
                              >
                                Plus
                              </summary>
                              <div
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  top: "calc(100% + 6px)",
                                  minWidth: 200,
                                  background: "#fff",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 12,
                                  boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
                                  padding: 8,
                                  zIndex: 20,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={busy || !canArchive || row.status === "archived"}
                                  onClick={() => void patchJournalAction(row.id, "archive")}
                                  style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#f8fafc",
                                    fontSize: 13,
                                    cursor: busy || !canArchive ? "not-allowed" : "pointer",
                                    opacity: !canArchive || row.status === "archived" ? 0.45 : 1,
                                  }}
                                >
                                  Archiver
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || !canHandle}
                                  onClick={() => void patchJournalAction(row.id, "cancel")}
                                  style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#f8fafc",
                                    fontSize: 13,
                                    cursor: busy || !canHandle ? "not-allowed" : "pointer",
                                    opacity: !canHandle ? 0.45 : 1,
                                  }}
                                >
                                  Annuler
                                </button>
                                {isCritical ? (
                                  <span
                                    title="Les alertes critiques ne peuvent pas être supprimées depuis l’interface."
                                    style={{
                                      padding: "10px 12px",
                                      fontSize: 12,
                                      color: "#64748b",
                                    }}
                                  >
                                    Non supprimable
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void deleteJournalRow(row.id)}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 12px",
                                      borderRadius: 8,
                                      border: "none",
                                      background: "#fef2f2",
                                      color: "#b91c1c",
                                      fontSize: 13,
                                      cursor: busy ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    Supprimer…
                                  </button>
                                )}
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "12px 20px",
                          fontSize: 12,
                          color: "#64748b",
                          paddingTop: 4,
                          borderTop: "1px solid #f1f5f9",
                        }}
                      >
                        <span>
                          <strong style={{ color: "#475569" }}>Employé</strong> {row.employeeLabel}
                        </span>
                        <span>
                          <strong style={{ color: "#475569" }}>Compagnie</strong>{" "}
                          {row.companyKey ?? "—"}
                        </span>
                        {showRepeat ? (
                          <span style={{ color: "#b45309", fontWeight: 600 }}>{showRepeat}</span>
                        ) : null}
                        <span>
                          <strong style={{ color: "#475569" }}>Courriel</strong> {row.emailDelivery}
                        </span>
                        <span>
                          <strong style={{ color: "#475569" }}>SMS</strong> {row.smsDelivery}
                        </span>
                        <span>
                          <strong style={{ color: "#475569" }}>Créée</strong>{" "}
                          {formatShortDate(row.createdAt)}
                        </span>
                        {row.handledAt ? (
                          <span>
                            <strong style={{ color: "#475569" }}>Traitée le</strong>{" "}
                            {formatShortDate(row.handledAt)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Phase 1 — files métier" subtitle="Comptes, effectifs, améliorations.">
          <div className="ui-stack-md">
            {queuesPhase1.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>Aucune file ouverte dans cette phase.</p>
            ) : (
              queuesPhase1.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <AppCard
                    className="ui-stack-sm"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 12,
                      borderRadius: 14,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 8px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#102544" }}>{row.label}</div>
                      <div style={{ fontSize: 13, color: "#64748b" }}>{row.description}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        {row.category} · {row.priority}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {row.count > 0 ? (
                        <TagoraCountBadge aria-label={`${row.count}`}>{row.count}</TagoraCountBadge>
                      ) : null}
                      <Link href={row.href} className="ui-button ui-button-secondary" style={{ borderRadius: 10 }}>
                        Ouvrir
                      </Link>
                    </div>
                  </AppCard>
                </motion.div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Phase 2 — agrégats"
          subtitle="Indicateurs liés au journal et aux opérations (dépenses, incidents, horodateur, etc.)."
        >
          <div className="ui-stack-md">
            {queuesPhase2.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                Aucun indicateur phase 2 pour le moment (tables vides ou filtres sans résultat).
              </p>
            ) : (
              queuesPhase2.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <AppCard
                    className="ui-stack-sm"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 12,
                      borderRadius: 14,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 1px 8px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#102544" }}>{row.label}</div>
                      <div style={{ fontSize: 13, color: "#64748b" }}>{row.description}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        {row.category} · {row.priority} · {row.source === "journal" ? "Journal" : "Agrégé"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {row.count > 0 ? (
                        <TagoraCountBadge aria-label={`${row.count}`}>{row.count}</TagoraCountBadge>
                      ) : null}
                      <Link href={row.href} className="ui-button ui-button-secondary" style={{ borderRadius: 10 }}>
                        Ouvrir
                      </Link>
                    </div>
                  </AppCard>
                </motion.div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Vue par catégorie" subtitle="Regroupement des files phase 1 et 2 par thème.">
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              color: "#64748b",
              lineHeight: 1.7,
              display: "grid",
              gap: 6,
            }}
          >
            {CATEGORY_ORDER.map((c) => (
              <li key={c}>
                <strong style={{ color: "#334155" }}>{c}</strong>
                {categories.has(c) ? (
                  <span> — {categories.get(c)!.length} file(s) active(s)</span>
                ) : (
                  <span> — prévu phase 2</span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </main>
  );
}
