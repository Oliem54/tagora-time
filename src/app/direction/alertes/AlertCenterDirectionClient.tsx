"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import JournalAlertCard from "@/app/direction/alertes/JournalAlertCard";
import { humanizeTechnicalIndicator } from "@/app/direction/alertes/technical-indicators-ui";

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

function primaryHrefForCategory(rows: QueueRow[]): string {
  if (rows.length === 0) return "/direction/alertes?status=open";
  const sorted = [...rows].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return b.count - a.count;
  });
  return sorted[0]!.href;
}

function alertQueuePriorityFr(p: QueueRow["priority"]): string {
  switch (p) {
    case "critical":
      return "Priorité critique";
    case "high":
      return "Priorité élevée";
    case "medium":
      return "Priorité modérée";
    default:
      return "Priorité faible";
  }
}

const TECH_BLOCK_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

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
  .ac-journal-insight {
    display: grid;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
  }
  .ac-journal-insight-row {
    display: grid;
    grid-template-columns: minmax(108px, 140px) 1fr;
    gap: 8px 14px;
    align-items: start;
    font-size: 14px;
    line-height: 1.5;
  }
  .ac-journal-insight-row dt {
    margin: 0;
    font-weight: 700;
    color: #64748b;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ac-journal-insight-row dd {
    margin: 0;
    color: #1e293b;
  }
  .ac-tech-panel {
    margin-top: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 12px;
    line-height: 1.55;
    overflow-x: auto;
  }
  .ac-tech-panel dl {
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .ac-tech-panel dt {
    font-weight: 700;
    color: #94a3b8;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ac-tech-panel dd {
    margin: 2px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: #f1f5f9;
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
  const phase2Queue = searchParams.get("phase2Queue");
  const phase2TechnicalQueue =
    phase2Queue === "echecs-notifications" || phase2Queue === "notes-mentions-erreur"
      ? phase2Queue
      : null;
  const phase2QueueInFailedUrlSuffix = useMemo(
    () =>
      phase2TechnicalQueue && journalFilter === "failed"
        ? `&phase2Queue=${encodeURIComponent(phase2TechnicalQueue)}`
        : "",
    [phase2TechnicalQueue, journalFilter]
  );
  const journalQueryString = useMemo(() => {
    const base =
      journalFilter === "actionable"
        ? "journal=actionable"
        : `journal=${encodeURIComponent(journalFilter)}`;
    if (journalFilter === "failed" && phase2TechnicalQueue) {
      return `${base}&phase2Queue=${encodeURIComponent(phase2TechnicalQueue)}`;
    }
    return base;
  }, [journalFilter, phase2TechnicalQueue]);
  const journalSectionRef = useRef<HTMLDivElement | null>(null);
  const { user, loading: accessLoading, role } = useCurrentAccess();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryFetched, setSummaryFetched] = useState(false);
  const [journalItems, setJournalItems] = useState<JournalItem[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalMutatingId, setJournalMutatingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [expandedTechnicalId, setExpandedTechnicalId] = useState<string | null>(null);
  const [technicalIndicatorDetailId, setTechnicalIndicatorDetailId] = useState<string | null>(null);
  const [categoriesSectionOpen, setCategoriesSectionOpen] = useState(true);

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
        const [sumRes, journalRes] = await Promise.all([
          fetch("/api/direction/alert-center/summary", {
            headers: authHeaders,
            signal: ac.signal,
          }),
          fetch(`/api/direction/alert-center/journal?${journalQueryString}`, {
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
  }, [accessLoading, user, role, router, journalFilter, journalQueryString]);

  useEffect(() => {
    if (!phase2TechnicalQueue) return;
    if (journalFilter === "failed") return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("phase2Queue");
    const qs = sp.toString();
    router.replace(qs ? `/direction/alertes?${qs}` : "/direction/alertes");
  }, [journalFilter, phase2TechnicalQueue, router, searchParams]);

  useEffect(() => {
    if (!phase2TechnicalQueue) return;
    if (journalFilter !== "failed") return;
    if (journalLoading) return;
    const el = journalSectionRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [phase2TechnicalQueue, journalFilter, journalLoading, journalItems.length]);

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
    const journalRes = await fetch(`/api/direction/alert-center/journal?${journalQueryString}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (journalRes.ok) {
      const j = (await journalRes.json()) as { items?: JournalItem[] };
      setJournalItems(Array.isArray(j.items) ? j.items : []);
    }
  }, [journalQueryString]);

  async function patchJournalAction(alertId: string, action: "mark_handled" | "archive" | "cancel") {
    try {
      setJournalMutatingId(alertId);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/direction/alert-center/journal/${encodeURIComponent(alertId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );
      if (res.ok) {
        await refreshJournalList();
        await refreshSummary();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(err.error ?? "Action impossible pour cette ligne.");
      }
    } finally {
      setJournalMutatingId(null);
    }
  }

  async function deleteJournalRow(alertId: string) {
    const isDerived = alertId.startsWith("derived-");
    if (
      !window.confirm(
        isDerived
          ? "Supprimer définitivement cette entrée de la file technique ?"
          : "Supprimer définitivement cette alerte ? Les alertes critiques ne peuvent pas être supprimées."
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
      const res = await fetch(
        `/api/direction/alert-center/journal/${encodeURIComponent(alertId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (res.ok) {
        await refreshJournalList();
        await refreshSummary();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(err.error ?? "Suppression impossible.");
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

  const queuesPhase1Full = useMemo((): QueueRow[] => {
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
    return [...rows].sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return b.count - a.count;
    });
  }, [summary]);

  const queuesPhase1 = useMemo((): QueueRow[] => {
    if (statusFilter === "open") {
      return queuesPhase1Full.filter((r) => r.count > 0);
    }
    return queuesPhase1Full;
  }, [queuesPhase1Full, statusFilter]);

  const queuesPhase2Full = useMemo((): QueueRow[] => {
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
    return [...rows].sort((a, b) => {
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      return b.count - a.count;
    });
  }, [summary?.phase2?.queues]);

  const queuesPhase2 = useMemo((): QueueRow[] => {
    const sorted = queuesPhase2Full;
    if (statusFilter === "open") {
      return sorted.filter((r) => r.count > 0);
    }
    return sorted;
  }, [queuesPhase2Full, statusFilter]);

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

  const categoryRollup = useMemo(() => {
    let categoriesWithAlerts = 0;
    let totalAlertCount = 0;
    for (const name of CATEGORY_ORDER) {
      const rows = categories.get(name) ?? [];
      const t = rows.reduce((s, r) => s + r.count, 0);
      totalAlertCount += t;
      if (t > 0) categoriesWithAlerts += 1;
    }
    return { categoriesWithAlerts, totalAlertCount };
  }, [categories]);

  const categoryRows = useMemo(() => {
    return CATEGORY_ORDER.map((name) => {
      const rows = categories.get(name) ?? [];
      const totalCount = rows.reduce((s, r) => s + r.count, 0);
      return {
        name,
        totalCount,
        href: primaryHrefForCategory(rows),
        isActive: totalCount > 0,
      };
    });
  }, [categories]);

  const inactiveCategoryCount = useMemo(
    () => categoryRows.filter((c) => !c.isActive).length,
    [categoryRows]
  );

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
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Synthèse de l’activité</span>
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

        {/* Filtre files métier (conservé) */}
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
                href={`/direction/alertes?status=open&journal=${journalFilter}${phase2QueueInFailedUrlSuffix}`}
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
                href={`/direction/alertes?status=all&journal=${journalFilter}${phase2QueueInFailedUrlSuffix}`}
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

        <div ref={journalSectionRef} id="alert-center-journal">
        <SectionCard
          title="Journal des alertes"
          subtitle="Filtrez par statut, traitez ou archivez sans quitter la page."
        >
          {phase2TechnicalQueue && journalFilter === "failed" ? (
            <div
              role="status"
              style={{
                marginBottom: 18,
                padding: "14px 16px",
                borderRadius: 12,
                background: "#f0fdfa",
                border: "1px solid #99f6e4",
                color: "#115e59",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <strong style={{ color: "#0f766e" }}>Vue filtrée</strong>
                <p style={{ margin: "8px 0 0", color: "#134e4a" }}>
                  {phase2TechnicalQueue === "echecs-notifications"
                    ? "Échecs d’envoi sur les canaux SMS et courriel — la liste ci-dessous regroupe les lignes à traiter ou à analyser."
                    : "Erreurs d’envoi sur les mentions internes par courriel — chaque entrée peut être traitée depuis le journal."}
                </p>
              </div>
              <details
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.65)",
                  border: "1px solid #ccfbf1",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 600,
                    color: "#0d9488",
                    fontSize: 13,
                  }}
                >
                  Voir détail technique
                </summary>
                <div style={{ marginTop: 12, fontSize: 13, color: "#0f766e", lineHeight: 1.6 }}>
                  {phase2TechnicalQueue === "echecs-notifications" ? (
                    <>
                      <div>
                        <strong>Suivi côté serveur :</strong> tables{" "}
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                          app_alert_deliveries
                        </span>
                        ,{" "}
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                          sms_alerts_log
                        </span>
                        .
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Période comptée :</strong> 90 jours glissants (fenêtre d’analyse).
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>Source données :</strong> mentions internes, filtre erreur d’envoi
                        courriel.
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <strong>Période comptée :</strong> 90 jours glissants.
                      </div>
                    </>
                  )}
                </div>
              </details>
            </div>
          ) : null}
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
                  href={`/direction/alertes?journal=${key}&status=${statusFilter}${
                    key === "failed" && phase2TechnicalQueue
                      ? `&phase2Queue=${encodeURIComponent(phase2TechnicalQueue)}`
                      : ""
                  }`}
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
              {phase2TechnicalQueue
                ? "Aucune entrée dans cette vue filtrée pour l’instant — élargissez le filtre ou réessayez plus tard."
                : `Aucune entrée pour « ${journalFilterLabel(journalFilter)} ».`}
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {journalItems.map((row) => {
                const busy = journalMutatingId === row.id;
                const techExpanded = expandedTechnicalId === row.id;

                return (
                  <li key={row.id}>
                    <JournalAlertCard
                      row={row}
                      busy={busy}
                      techExpanded={techExpanded}
                      onToggleTechnical={() =>
                        setExpandedTechnicalId(techExpanded ? null : row.id)
                      }
                      onMarkHandled={() => void patchJournalAction(row.id, "mark_handled")}
                      onArchive={() => void patchJournalAction(row.id, "archive")}
                      onCancel={() => void patchJournalAction(row.id, "cancel")}
                      onDelete={() => void deleteJournalRow(row.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        </div>

        <SectionCard title="Files métier" subtitle="Comptes, effectifs, améliorations.">
          <div className="ui-stack-md">
            {queuesPhase1.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>Aucune file ouverte.</p>
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
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>
                          {row.category}
                        </span>
                        <span style={priorityBadgeStyle(row.priority)}>
                          {alertQueuePriorityFr(row.priority)}
                        </span>
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
          title="Indicateurs techniques"
          subtitle="Suivi opérationnel et signaux système — libellés adaptés à la direction, détails techniques sur demande."
        >
          <div className="ui-stack-md" style={{ gap: 20 }}>
            {queuesPhase2.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b", fontSize: 15, lineHeight: 1.55 }}>
                Rien à signaler ici pour le filtre actuel. Les indicateurs réapparaîtront dès qu’un
                suivi sera pertinent.
              </p>
            ) : (
              queuesPhase2.map((row, i) => {
                const human = humanizeTechnicalIndicator(row);
                const detailOpen = technicalIndicatorDetailId === row.id;
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <AppCard
                      className="ui-stack-md"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                        borderRadius: 16,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
                        padding: "22px 24px",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 20,
                        }}
                      >
                        <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                          <h3
                            style={{
                              margin: "0 0 14px",
                              fontSize: 18,
                              fontWeight: 700,
                              color: "#0f172a",
                              letterSpacing: "-0.02em",
                              lineHeight: 1.25,
                            }}
                          >
                            {human.title}
                          </h3>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginBottom: 18,
                            }}
                          >
                            <span style={priorityBadgeStyle(row.priority)}>
                              {human.badgePriority}
                            </span>
                          </div>
                          <div style={{ display: "grid", gap: 16 }}>
                            <div>
                              <div style={TECH_BLOCK_LABEL}>Résumé</div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 15,
                                  color: "#334155",
                                  lineHeight: 1.55,
                                }}
                              >
                                {human.summary}
                              </p>
                            </div>
                            <div>
                              <div style={TECH_BLOCK_LABEL}>Cause probable</div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 15,
                                  color: "#334155",
                                  lineHeight: 1.55,
                                }}
                              >
                                {human.probableCause}
                              </p>
                            </div>
                            <div>
                              <div style={TECH_BLOCK_LABEL}>Action recommandée</div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 15,
                                  color: "#334155",
                                  lineHeight: 1.55,
                                }}
                              >
                                {human.recommendedAction}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 12,
                            flexShrink: 0,
                          }}
                        >
                          {row.count > 0 ? (
                            <TagoraCountBadge aria-label={`${row.count} alertes`}>
                              {row.count}
                            </TagoraCountBadge>
                          ) : (
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#94a3b8",
                              }}
                            >
                              0
                            </span>
                          )}
                          <Link
                            href={row.href}
                            className="ui-button ui-button-secondary"
                            style={{ borderRadius: 10, whiteSpace: "nowrap" }}
                          >
                            Ouvrir
                          </Link>
                        </div>
                      </div>
                      <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #f1f5f9" }}>
                        <button
                          type="button"
                          aria-expanded={detailOpen}
                          onClick={() =>
                            setTechnicalIndicatorDetailId(detailOpen ? null : row.id)
                          }
                          className="ui-button ui-button-secondary"
                          style={{
                            borderRadius: 10,
                            fontSize: 13,
                            padding: "8px 14px",
                            border: "1px dashed #cbd5e1",
                            background: detailOpen ? "#f8fafc" : "#fff",
                          }}
                        >
                          {detailOpen ? "Masquer détail technique" : "Voir détail technique"}
                        </button>
                        {detailOpen ? (
                          <div className="ac-tech-panel" style={{ marginTop: 14 }}>
                            <dl style={{ margin: 0, display: "grid", gap: 12 }}>
                              {human.technicalDetails.map((line) => (
                                <div key={`${row.id}-${line.label}`}>
                                  <dt>{line.label}</dt>
                                  <dd>{line.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : null}
                      </div>
                    </AppCard>
                  </motion.div>
                );
              })
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Alertes par catégorie"
          subtitle="Domaines métier : volume d’alertes actives et accès rapide."
        >
          <div
            style={{
              borderRadius: 16,
              padding: "18px 20px",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              border: "1px solid #e2e8f0",
              marginBottom: categoriesSectionOpen ? 22 : 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  color: "#475569",
                  maxWidth: 620,
                  lineHeight: 1.55,
                }}
              >
                {categoryRollup.categoriesWithAlerts === 0
                  ? "Aucune alerte active dans les files affichées — les domaines ci-dessous sont à jour pour ce filtre."
                  : `${categoryRollup.totalAlertCount} alerte${categoryRollup.totalAlertCount > 1 ? "s" : ""} active${categoryRollup.totalAlertCount > 1 ? "s" : ""} répartie${categoryRollup.totalAlertCount > 1 ? "s" : ""} dans ${categoryRollup.categoriesWithAlerts} domaine${categoryRollup.categoriesWithAlerts > 1 ? "s" : ""}.`}
              </p>
              <button
                type="button"
                aria-expanded={categoriesSectionOpen}
                onClick={() => setCategoriesSectionOpen((v) => !v)}
                className="ui-button ui-button-secondary"
                style={{ borderRadius: 10, flexShrink: 0 }}
              >
                {categoriesSectionOpen ? "Masquer les catégories" : "Voir les catégories"}
              </button>
            </div>
          </div>

          {categoriesSectionOpen ? (
            <>
              {categoryRows.some((c) => c.isActive) ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(292px, 1fr))",
                    gap: 16,
                  }}
                >
                  {categoryRows
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <AppCard
                        key={c.name}
                        className="ui-stack-sm"
                        style={{
                          padding: "20px 22px",
                          borderRadius: 16,
                          border: "1px solid #ccfbf1",
                          boxShadow: "0 2px 16px rgba(20, 184, 166, 0.08)",
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          minHeight: 148,
                          gap: 14,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 17,
                              fontWeight: 700,
                              color: "#0f172a",
                              marginBottom: 10,
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {c.name}
                          </div>
                          <div style={{ fontSize: 15, color: "#475569", marginBottom: 10 }}>
                            {c.totalCount === 1
                              ? "1 alerte active"
                              : `${c.totalCount} alertes actives`}
                          </div>
                          <span style={statusBadgeStyle("open")}>À suivre</span>
                        </div>
                        <Link
                          href={c.href}
                          className="ui-button ui-button-secondary"
                          style={{ borderRadius: 10, alignSelf: "flex-start" }}
                        >
                          Voir
                        </Link>
                      </AppCard>
                    ))}
                </div>
              ) : (
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 15,
                    color: "#64748b",
                    lineHeight: 1.55,
                  }}
                >
                  Aucun domaine avec alerte active pour le filtre choisi — ouvrez « Toutes les
                  files » pour voir l’ensemble des sujets, y compris sans volume.
                </p>
              )}
              {inactiveCategoryCount > 0 ? (
                <details
                  style={{
                    marginTop: 22,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#fafafa",
                    border: "1px solid #f1f5f9",
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#94a3b8",
                      outline: "none",
                    }}
                  >
                    {inactiveCategoryCount} domaine{inactiveCategoryCount > 1 ? "s" : ""} sans
                    alerte active
                  </summary>
                  <ul
                    style={{
                      margin: "14px 0 0",
                      padding: 0,
                      listStyle: "none",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    {categoryRows
                      .filter((c) => !c.isActive)
                      .map((c) => (
                        <li
                          key={c.name}
                          style={{
                            fontSize: 14,
                            color: "#94a3b8",
                            padding: "10px 14px",
                            borderRadius: 10,
                            background: "#fff",
                            border: "1px solid #f1f5f9",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#64748b" }}>{c.name}</span>
                          <span style={statusBadgeStyle("handled")}>À jour</span>
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </SectionCard>
      </div>
    </main>
  );
}
