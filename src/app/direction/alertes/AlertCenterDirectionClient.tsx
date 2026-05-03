"use client";

import { useEffect, useMemo, useState } from "react";
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
};

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

export default function AlertCenterDirectionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "open";
  const { user, loading: accessLoading, role } = useCurrentAccess();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [summaryFetched, setSummaryFetched] = useState(false);
  const [journalItems, setJournalItems] = useState<JournalItem[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [markHandlingId, setMarkHandlingId] = useState<string | null>(null);

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
          }),
          fetch("/api/direction/alert-center/journal?filter=actionable", {
            headers: authHeaders,
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
      } catch {
        if (!cancelled) {
          setSummary(null);
          setJournalItems([]);
        }
      } finally {
        if (!cancelled) {
          setSummaryFetched(true);
          setJournalLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessLoading, user, role, router]);

  async function markJournalHandled(alertId: string) {
    try {
      setMarkHandlingId(alertId);
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
        body: JSON.stringify({ action: "mark_handled" }),
      });
      if (res.ok) {
        setJournalItems((prev) => prev.filter((row) => row.id !== alertId));
        const sumRes = await fetch("/api/direction/alert-center/summary", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (sumRes.ok) {
          setSummary((await sumRes.json()) as SummaryPayload);
        }
      }
    } finally {
      setMarkHandlingId(null);
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
  const showLoader =
    accessLoading || (Boolean(user) && roleOk && !summaryFetched);

  if (showLoader) {
    return (
      <TagoraLoadingScreen isLoading message="Chargement du centre d'alertes..." fullScreen />
    );
  }

  if (!user || !roleOk) {
    return null;
  }

  const badgeTotal = summary?.badgeTotal ?? 0;
  const failed = summary?.failed?.smsOrEmail ?? 0;
  const critical = summary?.criticalUntreated?.total ?? 0;

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Centre d'alertes"
          showNavigation={false}
          actions={
            <div style={{ display: "flex", gap: "var(--ui-space-3)", flexWrap: "wrap" }}>
              <Link className="ui-button ui-button-primary" href="/direction/alertes/communications">
                Communications
              </Link>
              <Link className="ui-button ui-button-secondary" href="/direction/dashboard">
                Tableau de bord
              </Link>
            </div>
          }
        />

        <AppCard className="ui-stack-sm" style={{ padding: "var(--ui-space-4)" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--ui-space-4)",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 600, color: "#102544" }}>À traiter (badge)</span>
              {badgeTotal > 0 ? (
                <TagoraCountBadge aria-label={`${badgeTotal} alertes`}>{badgeTotal}</TagoraCountBadge>
              ) : (
                <span style={{ color: "#64748b", fontSize: 14 }}>0</span>
              )}
            </div>
            <div style={{ fontSize: 14, color: "#64748b" }}>
              Critiques : <strong style={{ color: "#102544" }}>{critical}</strong>
              {" · "}
              Échecs envoi (SMS / courriel) : <strong style={{ color: "#102544" }}>{failed}</strong>
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              Filtre :{" "}
              <Link
                href="/direction/alertes?status=open"
                style={{ color: statusFilter === "open" ? "#0f766e" : "#64748b" }}
              >
                Ouvertes
              </Link>
              {" · "}
              <Link
                href="/direction/alertes?status=all"
                style={{ color: statusFilter === "all" ? "#0f766e" : "#64748b" }}
              >
                Toutes les files
              </Link>
            </div>
          </div>
        </AppCard>

        <SectionCard
          title="Journal (app_alerts)"
          subtitle="Catégorie, priorité, employé, compagnie, statut des envois courriel / SMS et actions."
        >
          {journalLoading ? (
            <p style={{ color: "#64748b", margin: 0 }}>Chargement du journal…</p>
          ) : journalItems.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>
              Aucune entrée ouverte ou en échec dans le journal.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  minWidth: 720,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Priorité</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Catégorie</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Titre</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Message</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Employé</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Compagnie</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Statut</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Courriel</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>SMS</th>
                    <th style={{ padding: "8px 6px", color: "#64748b" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {journalItems.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>
                      <td style={{ padding: "10px 6px", fontWeight: 600, color: "#102544" }}>
                        {row.priority}
                      </td>
                      <td style={{ padding: "10px 6px" }}>{row.category}</td>
                      <td style={{ padding: "10px 6px", maxWidth: 200 }}>{row.title}</td>
                      <td style={{ padding: "10px 6px", maxWidth: 280, color: "#475569" }}>
                        <span style={{ display: "block", maxHeight: 72, overflow: "hidden" }}>
                          {row.message ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px" }}>{row.employeeLabel}</td>
                      <td style={{ padding: "10px 6px" }}>{row.companyKey ?? "—"}</td>
                      <td style={{ padding: "10px 6px" }}>{row.status}</td>
                      <td style={{ padding: "10px 6px" }}>{row.emailDelivery}</td>
                      <td style={{ padding: "10px 6px" }}>{row.smsDelivery}</td>
                      <td style={{ padding: "10px 6px", whiteSpace: "nowrap" }}>
                        {row.linkHref ? (
                          <Link
                            href={row.linkHref}
                            className="tagora-dark-action"
                            style={{ padding: "6px 10px", marginRight: 8, display: "inline-block" }}
                          >
                            Ouvrir
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="ui-button ui-button-secondary"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                          disabled={markHandlingId === row.id}
                          onClick={() => {
                            void markJournalHandled(row.id);
                          }}
                        >
                          {markHandlingId === row.id ? "…" : "Traité"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Phase 1 — files métier"
          subtitle="Comptes, effectifs, améliorations (inchangé)."
        >
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
                      <Link href={row.href} className="tagora-dark-action" style={{ padding: "8px 14px" }}>
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
          title="Phase 2 — journal et agrégats"
          subtitle="app_alerts / app_alert_deliveries + comptages dérivés (dépenses, incidents, horodateur, livraisons, Titan, erreurs d envoi). Les envois existants ne sont pas supprimés."
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
                      <Link href={row.href} className="tagora-dark-action" style={{ padding: "8px 14px" }}>
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
          title="Vue par catégorie"
          subtitle="Regroupement des files phase 1 et 2 par thème."
        >
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
