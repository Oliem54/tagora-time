"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileStack,
  Files,
  ReceiptText,
  Sparkles,
  Truck,
  UsersRound,
  Bell,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraCountBadge from "@/app/components/TagoraCountBadge";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";

type ModuleGroupId = "supervision" | "operations" | "administration";

type ModuleDefinition = {
  id: string;
  href: string;
  label: string;
  description: string;
  group: ModuleGroupId;
  icon: LucideIcon;
  tone: TagoraStatTone;
  /** compteur badges (admin uniquement) */
  pendingKey?: "ameliorations" | "effectifs_schedule" | "alert_center";
};

const ALERT_CENTER_HREF = "/direction/alertes";

const MODULE_GROUPS: { id: ModuleGroupId; title: string; subtitle: string }[] = [
  {
    id: "supervision",
    title: "Supervision",
    subtitle: "Suivi centralise des alertes et files d'attente.",
  },
  {
    id: "operations",
    title: "Operations et suivi",
    subtitle: "Livraisons, terrain et documents.",
  },
  {
    id: "administration",
    title: "Administration",
    subtitle: "Comptes, paie, facturation et controles.",
  },
];

const MODULES: ModuleDefinition[] = [
  {
    id: "alert-center",
    href: ALERT_CENTER_HREF,
    label: "Centre d'alertes",
    description: "Alertes direction, SMS, courriels et suivis a traiter.",
    group: "supervision",
    icon: Bell,
    tone: "orange",
    pendingKey: "alert_center",
  },
  {
    id: "livraisons",
    href: "/direction/livraisons",
    label: "Livraison et ramassage",
    description: "Planification et suivi des operations.",
    group: "operations",
    icon: Truck,
    tone: "blue",
  },
  {
    id: "terrain",
    href: "/direction/terrain",
    label: "Terrain",
    description: "Carte en direct et equipes.",
    group: "operations",
    icon: Waypoints,
    tone: "cyan",
  },
  {
    id: "documents",
    href: "/direction/documents",
    label: "Documents",
    description: "Dossiers et pieces.",
    group: "operations",
    icon: Files,
    tone: "blue",
  },
  {
    id: "ameliorations",
    href: "/ameliorations",
    label: "Ameliorations",
    description: "Suggestions et ameliorations a traiter.",
    group: "administration",
    icon: Sparkles,
    tone: "yellow",
    pendingKey: "ameliorations",
  },
  {
    id: "comptes",
    href: "/direction/demandes-comptes",
    label: "Gestion des comptes employes",
    description: "Acces et fiches employes.",
    group: "administration",
    icon: UsersRound,
    tone: "purple",
  },
  {
    id: "horodateur",
    href: "/direction/horodateur",
    label: "Horodateur",
    description: "Quarts, pointage et anomalies.",
    group: "administration",
    icon: Clock3,
    tone: "green",
  },
  {
    id: "horodateur-registre",
    href: "/direction/horodateur/registre",
    label: "Registre des heures",
    description: "Historique des heures et punchs par periode.",
    group: "administration",
    icon: ClipboardList,
    tone: "cyan",
  },
  {
    id: "effectifs",
    href: "/direction/effectifs",
    label: "Calendrier des effectifs",
    description: "Couverture des équipes par département.",
    group: "administration",
    icon: CalendarDays,
    tone: "cyan",
    pendingKey: "effectifs_schedule",
  },
  {
    id: "paie",
    href: "/direction/paie-compagnies",
    label: "Paie par compagnie",
    description: "Heures et couts par compagnie.",
    group: "administration",
    icon: ReceiptText,
    tone: "purple",
  },
  {
    id: "facturation",
    href: "/direction/facturation-titan",
    label: "Facturation Titan",
    description: "Montants a facturer.",
    group: "administration",
    icon: FileStack,
    tone: "orange",
  },
  {
    id: "ressources",
    href: "/direction/ressources",
    label: "Ressources",
    description: "Employes, flotte et referentiels.",
    group: "administration",
    icon: BriefcaseBusiness,
    tone: "purple",
  },
];

export default function AdminDashboardClient() {
  const router = useRouter();
  const { user, loading } = useCurrentAccess();
  const [ameliorationsPending, setAmeliorationsPending] = useState<number | null>(null);
  const [effectifsSchedulePending, setEffectifsSchedulePending] = useState<number | null>(null);
  const [alertCenterMeta, setAlertCenterMeta] = useState({
    badgeTotal: 0,
    failed: 0,
    critical: 0,
  });
  const [alertOpenSum, setAlertOpenSum] = useState(0);

  useEffect(() => {
    if (loading || !user) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || cancelled) {
          return;
        }
        const token = session.access_token;
        const summaryRes = await fetch("/api/direction/alert-center/summary", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (!summaryRes.ok) {
          setAmeliorationsPending(null);
          setEffectifsSchedulePending(null);
          setAlertCenterMeta({ badgeTotal: 0, failed: 0, critical: 0 });
          setAlertOpenSum(0);
          return;
        }

        const s = (await summaryRes.json()) as {
          open?: {
            improvements?: unknown;
            effectifsScheduleRequests?: unknown;
            sum?: unknown;
          };
          failed?: { total?: unknown; smsOrEmail?: unknown };
          criticalUntreated?: { total?: unknown };
          badgeTotal?: unknown;
        };

        const imp = Number(s.open?.improvements);
        const ef = Number(s.open?.effectifsScheduleRequests);
        setAmeliorationsPending(Number.isFinite(imp) ? Math.max(0, imp) : null);
        setEffectifsSchedulePending(Number.isFinite(ef) ? Math.max(0, ef) : null);
        const bt = Number(s.badgeTotal);
        const fl = Number(s.failed?.smsOrEmail ?? s.failed?.total);
        const cr = Number(s.criticalUntreated?.total);
        setAlertCenterMeta({
          badgeTotal: Number.isFinite(bt) ? Math.max(0, bt) : 0,
          failed: Number.isFinite(fl) ? Math.max(0, fl) : 0,
          critical: Number.isFinite(cr) ? Math.max(0, cr) : 0,
        });
        const os = Number(s.open?.sum);
        setAlertOpenSum(Number.isFinite(os) ? Math.max(0, os) : 0);
      } catch {
        if (!cancelled) {
          setAmeliorationsPending(null);
          setEffectifsSchedulePending(null);
          setAlertCenterMeta({ badgeTotal: 0, failed: 0, critical: 0 });
          setAlertOpenSum(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  useEffect(() => {
    if (loading || user) {
      return;
    }
    router.replace("/direction/login");
  }, [loading, user, router]);

  const groupedModules = useMemo(
    () =>
      MODULE_GROUPS.map((group) => ({
        ...group,
        modules: MODULES.filter((m) => m.group === group.id),
      })).filter((g) => g.modules.length > 0),
    []
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/direction/login");
  }

  function badgeForModule(m: ModuleDefinition) {
    if (
      m.pendingKey === "alert_center" &&
      alertCenterMeta.badgeTotal > 0
    ) {
      const n = alertCenterMeta.badgeTotal;
      return (
        <TagoraCountBadge aria-label={`${n} alerte(s) au centre d'alertes`}>
          {n > 99 ? "99+" : n}
        </TagoraCountBadge>
      );
    }
    if (m.pendingKey === "ameliorations" && ameliorationsPending != null && ameliorationsPending > 0) {
      return (
        <TagoraCountBadge aria-label={`${ameliorationsPending} amélioration(s) en attente`}>
          {ameliorationsPending > 99 ? "99+" : ameliorationsPending}
        </TagoraCountBadge>
      );
    }
    if (
      m.pendingKey === "effectifs_schedule" &&
      effectifsSchedulePending != null &&
      effectifsSchedulePending > 0
    ) {
      const n = effectifsSchedulePending;
      return (
        <TagoraCountBadge aria-label={`${n} demande${n > 1 ? "s" : ""} d'horaire en attente`}>
          {n > 99 ? "99+" : n}
        </TagoraCountBadge>
      );
    }
    return null;
  }

  if (loading) {
    return (
      <TagoraLoadingScreen
        isLoading
        message="Chargement de votre espace..."
        fullScreen
      />
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content ui-stack-lg">
        <AuthenticatedPageHeader
          title="Tableau de bord administrateur"
          subtitle=""
          showNavigation={false}
          actions={
            <div
              style={{
                display: "flex",
                gap: "var(--ui-space-3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <SecondaryButton onClick={handleLogout}>Se déconnecter</SecondaryButton>
            </div>
          }
        />

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <AppCard
            className="ui-stack-sm"
            style={{
              padding: "var(--ui-space-4)",
              borderLeft: "4px solid #f97316",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--ui-space-4)",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontWeight: 600, color: "#102544" }}>Résumé alertes</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--ui-space-5)",
                  fontSize: 14,
                  color: "#64748b",
                }}
              >
                <span>
                  A traiter :{" "}
                  <strong style={{ color: "#102544" }}>{alertOpenSum}</strong>
                </span>
                <span>
                  Critiques :{" "}
                  <strong style={{ color: "#102544" }}>{alertCenterMeta.critical}</strong>
                </span>
                <span>
                  Echecs SMS / courriel :{" "}
                  <strong style={{ color: "#102544" }}>{alertCenterMeta.failed}</strong>
                </span>
              </div>
              <button
                type="button"
                className="tagora-dark-action"
                onClick={() => router.push(`${ALERT_CENTER_HREF}?status=open`)}
                style={{ padding: "8px 14px", fontSize: 14 }}
              >
                Ouvrir le centre d'alertes
              </button>
            </div>
          </AppCard>
        </motion.section>

        {groupedModules.map((group, groupIndex) => (
          <motion.section
            key={group.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: groupIndex * 0.06, ease: "easeOut" }}
          >
            <SectionCard title={group.title} subtitle={group.subtitle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "var(--ui-space-5)",
                  alignItems: "stretch",
                }}
              >
                {group.modules.map((item, moduleIndex) => {
                  const Icon = item.icon;
                  return (
                    <motion.article
                      key={item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.34,
                        delay: groupIndex * 0.05 + moduleIndex * 0.03,
                        ease: "easeOut",
                      }}
                      whileHover={{ y: -6 }}
                      style={{ height: "100%" }}
                    >
                      <AppCard
                        className="ui-stack-md tagora-dashboard-module-card"
                        style={{
                          height: "100%",
                          minHeight: 262,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                        }}
                      >
                        <div className="ui-stack-md" style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 14,
                            }}
                          >
                            <motion.div
                              whileHover={{ y: -1, scale: 1.04 }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                            >
                              <TagoraIconBadge tone={item.tone} size="lg">
                                <Icon size={24} strokeWidth={2.1} aria-hidden />
                              </TagoraIconBadge>
                            </motion.div>
                            {badgeForModule(item)}
                          </div>

                          <div className="ui-stack-sm">
                            <h3
                              style={{
                                margin: 0,
                                fontSize: 24,
                                lineHeight: 1.08,
                                letterSpacing: "-0.03em",
                                color: "#102544",
                              }}
                            >
                              {item.label}
                            </h3>
                            <p
                              style={{
                                margin: 0,
                                color: "#64748b",
                                lineHeight: 1.65,
                                fontSize: 14,
                              }}
                            >
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <motion.button
                          type="button"
                          className="tagora-dark-action"
                          whileHover={{ y: -1 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                          onClick={() =>
                            router.push(
                              item.id === "alert-center"
                                ? `${ALERT_CENTER_HREF}?status=open`
                                : item.href
                            )
                          }
                          style={{
                            width: "100%",
                            justifyContent: "space-between",
                            marginTop: 20,
                          }}
                        >
                          <span>Acceder</span>
                          <ArrowUpRight size={16} />
                        </motion.button>
                      </AppCard>
                    </motion.article>
                  );
                })}
              </div>
            </SectionCard>
          </motion.section>
        ))}
      </div>
    </main>
  );
}
