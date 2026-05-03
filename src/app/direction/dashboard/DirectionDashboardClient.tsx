"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileStack,
  Files,
  Route,
  Sparkles,
  TimerReset,
  Truck,
  ClipboardList,
  Bell,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { useCurrentAccess } from "../../hooks/useCurrentAccess";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import SectionCard from "@/app/components/ui/SectionCard";
import AppCard from "@/app/components/ui/AppCard";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import TagoraCountBadge from "@/app/components/TagoraCountBadge";
import TagoraIconBadge from "@/app/components/TagoraIconBadge";
import type { TagoraStatTone } from "@/app/components/tagora-stat-tone";

type ModulePermission = "documents" | "livraisons" | "terrain" | "ressources" | null;
type ModuleGroupId = "supervision" | "operations" | "gestion";

type ModuleDefinition = {
  href: string;
  label: string;
  description: string;
  permission: ModulePermission;
  group: ModuleGroupId;
  icon: LucideIcon;
  tone: TagoraStatTone;
};

type ModuleGroup = {
  id: ModuleGroupId;
  title: string;
  subtitle: string;
};

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "supervision",
    title: "Supervision",
    subtitle: "Suivi centralise des alertes et files d'attente.",
  },
  {
    id: "operations",
    title: "Operations terrain",
    subtitle: "Terrain et suivi.",
  },
  {
    id: "gestion",
    title: "Gestion interne",
    subtitle: "Documents et ressources.",
  },
];

const EFFECTIFS_MODULE_HREF = "/direction/effectifs";
const ALERT_CENTER_HREF = "/direction/alertes";

const MODULES: ModuleDefinition[] = [
  {
    href: ALERT_CENTER_HREF,
    label: "Centre d'alertes",
    description: "Alertes direction, SMS, courriels et suivis a traiter.",
    permission: null,
    group: "supervision",
    icon: Bell,
    tone: "orange",
  },
  {
    href: "/direction/livraisons",
    label: "Livraison & ramassage",
    description: "Planification livraisons et ramassages.",
    permission: "livraisons",
    group: "operations",
    icon: Truck,
    tone: "blue",
  },
  {
    href: "/direction/horodateur",
    label: "Horodateur",
    description: "Suivi live des punchs, pauses et exceptions.",
    permission: null,
    group: "operations",
    icon: Clock3,
    tone: "green",
  },
  {
    href: "/direction/horodateur/registre",
    label: "Registre des heures",
    description: "Historique des quarts, punchs et exceptions.",
    permission: "terrain",
    group: "operations",
    icon: ClipboardList,
    tone: "cyan",
  },
  {
    href: EFFECTIFS_MODULE_HREF,
    label: "Calendrier des effectifs",
    description: "Couverture des équipes par département.",
    permission: null,
    group: "operations",
    icon: CalendarDays,
    tone: "cyan",
  },
  {
    href: "/direction/terrain",
    label: "Terrain",
    description: "Carte en direct et equipes.",
    permission: "terrain",
    group: "operations",
    icon: Waypoints,
    tone: "cyan",
  },
  {
    href: "/direction/sorties-terrain",
    label: "Sorties terrain",
    description: "Kilomètres et temps.",
    permission: "terrain",
    group: "operations",
    icon: Route,
    tone: "orange",
  },
  {
    href: "/direction/temps-titan",
    label: "Temps Titan",
    description: "Heures et refacturation.",
    permission: "terrain",
    group: "operations",
    icon: TimerReset,
    tone: "purple",
  },
  {
    href: "/direction/documents",
    label: "Documents",
    description: "Dossiers et pièces.",
    permission: "documents",
    group: "gestion",
    icon: Files,
    tone: "blue",
  },
  {
    href: "/direction/ressources",
    label: "Ressources",
    description: "Employés et flotte.",
    permission: "ressources",
    group: "gestion",
    icon: BriefcaseBusiness,
    tone: "purple",
  },
  {
    href: "/direction/demandes-comptes",
    label: "Gestion des comptes",
    description: "Comptes employés, accès opérationnels et préférences d alertes.",
    permission: "ressources",
    group: "gestion",
    icon: FileStack,
    tone: "purple",
  },
  {
    href: "/ameliorations",
    label: "Améliorations",
    description: "Suggestions, demandes d'amélioration et suivis internes.",
    permission: "ressources",
    group: "gestion",
    icon: Sparkles,
    tone: "yellow",
  },
];

function dedupeModulesByHref(items: ModuleDefinition[]): ModuleDefinition[] {
  const seen = new Set<string>();
  const out: ModuleDefinition[] = [];
  for (const m of items) {
    if (seen.has(m.href)) continue;
    seen.add(m.href);
    out.push(m);
  }
  return out;
}

export default function DirectionDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, hasPermission, role, permissions } = useCurrentAccess();
  const [archiveSearch, setArchiveSearch] = useState("");
  const [forceShowLoader, setForceShowLoader] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingAccountRequestsCount, setPendingAccountRequestsCount] = useState(0);
  const [pendingImprovementsCount, setPendingImprovementsCount] = useState(0);
  const [pendingEffectifsScheduleCount, setPendingEffectifsScheduleCount] = useState(0);
  const [alertCenterMeta, setAlertCenterMeta] = useState({
    badgeTotal: 0,
    failed: 0,
    critical: 0,
  });

  const debugShowLoader = searchParams.get("showLoader") === "1";

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!debugShowLoader) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForceShowLoader(false);
      return;
    }
    setForceShowLoader(true);
    const timer = window.setTimeout(() => {
      setForceShowLoader(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [debugShowLoader]);

  useEffect(() => {
    if (loading || user) {
      return;
    }
    router.replace("/direction/login");
  }, [loading, user, router]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setAccessToken(data.session?.access_token ?? null);
    };

    void init();
  }, []);

  useEffect(() => {
    if (!accessToken || !user || loading) {
      return;
    }

    const loadPendingBadges = async () => {
      const resetZeros = () => {
        setPendingAccountRequestsCount(0);
        setPendingImprovementsCount(0);
        setPendingEffectifsScheduleCount(0);
        setAlertCenterMeta({ badgeTotal: 0, failed: 0, critical: 0 });
      };

      if (role !== "admin" && role !== "direction") {
        resetZeros();
        return;
      }

      try {
        const summaryResponse = await fetch("/api/direction/alert-center/summary", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (summaryResponse.ok) {
          const s = (await summaryResponse.json()) as {
            open?: {
              accountRequests?: unknown;
              improvements?: unknown;
              effectifsScheduleRequests?: unknown;
            };
            failed?: { total?: unknown; smsOrEmail?: unknown };
            criticalUntreated?: { total?: unknown };
            badgeTotal?: unknown;
          };
          const ar = Number(s.open?.accountRequests);
          const imp = Number(s.open?.improvements);
          const ef = Number(s.open?.effectifsScheduleRequests);
          setPendingAccountRequestsCount(Number.isFinite(ar) ? Math.max(0, ar) : 0);
          setPendingImprovementsCount(Number.isFinite(imp) ? Math.max(0, imp) : 0);
          setPendingEffectifsScheduleCount(Number.isFinite(ef) ? Math.max(0, ef) : 0);
          const bt = Number(s.badgeTotal);
          const fl = Number(s.failed?.smsOrEmail ?? s.failed?.total);
          const cr = Number(s.criticalUntreated?.total);
          setAlertCenterMeta({
            badgeTotal: Number.isFinite(bt) ? Math.max(0, bt) : 0,
            failed: Number.isFinite(fl) ? Math.max(0, fl) : 0,
            critical: Number.isFinite(cr) ? Math.max(0, cr) : 0,
          });
          return;
        }

        resetZeros();
      } catch {
        resetZeros();
      }
    };

    void loadPendingBadges();
  }, [accessToken, user, role, loading]);

  const isDirectionCoreRole = role === "admin" || role === "direction";

  const HORODATEUR_MODULE_HREF = "/direction/horodateur";

  const visibleModules = useMemo(() => {
    const showEffectifsTile = role === "admin" || role === "direction";
    const fromConfig = MODULES.filter((item) => {
      if (item.href === ALERT_CENTER_HREF && !isDirectionCoreRole) return false;
      if (item.href === EFFECTIFS_MODULE_HREF) return false;
      return item.permission ? hasPermission(item.permission) : true;
    });
    let list = fromConfig;
    if (isDirectionCoreRole && !list.some((m) => m.href === HORODATEUR_MODULE_HREF)) {
      const core = MODULES.find((m) => m.href === HORODATEUR_MODULE_HREF);
      if (core) {
        list = [...list, core];
      }
    }
    if (showEffectifsTile && !list.some((m) => m.href === EFFECTIFS_MODULE_HREF)) {
      const effectifsDef = MODULES.find((m) => m.href === EFFECTIFS_MODULE_HREF);
      if (effectifsDef) {
        const registreIdx = list.findIndex((m) => m.href === "/direction/horodateur/registre");
        if (registreIdx >= 0) {
          list = [
            ...list.slice(0, registreIdx + 1),
            effectifsDef,
            ...list.slice(registreIdx + 1),
          ];
        } else {
          const horoIdx = list.findIndex((m) => m.href === HORODATEUR_MODULE_HREF);
          list =
            horoIdx >= 0
              ? [...list.slice(0, horoIdx + 1), effectifsDef, ...list.slice(horoIdx + 1)]
              : [...list, effectifsDef];
        }
      }
    }
    return dedupeModulesByHref(list);
  }, [hasPermission, role, isDirectionCoreRole]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    console.log("[direction-dashboard-visible-modules]", {
      role,
      permissionsLoading: loading,
      permissions,
      visibleModules: visibleModules.map((m) => m.label),
    });
  }, [role, loading, permissions, visibleModules]);

  const groupedModules = useMemo(
    () =>
      MODULE_GROUPS.map((group) => ({
        ...group,
        modules: visibleModules.filter((item) => item.group === group.id),
      })).filter((group) => group.modules.length > 0),
    [visibleModules]
  );

  const notificationCountByHref = useMemo(
    () =>
      new Map<string, number>([
        [ALERT_CENTER_HREF, alertCenterMeta.badgeTotal],
        ["/direction/demandes-comptes", pendingAccountRequestsCount],
        ["/ameliorations", pendingImprovementsCount],
        [EFFECTIFS_MODULE_HREF, pendingEffectifsScheduleCount],
      ]),
    [
      alertCenterMeta.badgeTotal,
      pendingAccountRequestsCount,
      pendingImprovementsCount,
      pendingEffectifsScheduleCount,
    ]
  );

  const alertesATraiterSum =
    pendingAccountRequestsCount + pendingImprovementsCount + pendingEffectifsScheduleCount;

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/direction/login");
  }

  function goToArchives(searchValue?: string) {
    const value = (searchValue ?? archiveSearch).trim();
    if (!value) {
      router.push("/direction/livraisons/archives");
      return;
    }
    router.push(`/direction/livraisons/archives?search=${encodeURIComponent(value)}`);
  }

  if (loading || forceShowLoader) {
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
          title="Tableau de bord direction"
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

        {isDirectionCoreRole ? (
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
                    <strong style={{ color: "#102544" }}>{alertesATraiterSum}</strong>
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
        ) : null}

        {groupedModules.map((group, groupIndex) => (
          <motion.section
            key={group.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: groupIndex * 0.06, ease: "easeOut" }}
          >
            <SectionCard
              title={group.title}
              subtitle={group.subtitle}
            >
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
                      key={item.href}
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
                      <AppCard className="ui-stack-md tagora-dashboard-module-card" style={{ height: "100%", minHeight: 262, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
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
                          </div>

                          <div className="ui-stack-sm">
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
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
                              {(notificationCountByHref.get(item.href) ?? 0) > 0 ? (
                                <TagoraCountBadge
                                  aria-label={
                                    item.href === ALERT_CENTER_HREF
                                      ? `${notificationCountByHref.get(item.href)} alerte(s) (ouvertes, echecs ou critiques non traitees)`
                                      : `${notificationCountByHref.get(item.href)} en attente`
                                  }
                                >
                                  {notificationCountByHref.get(item.href)}
                                </TagoraCountBadge>
                              ) : null}
                            </div>
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
                              item.href === ALERT_CENTER_HREF
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

        {hasPermission("livraisons") ? (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.2, ease: "easeOut" }}
          >
            <SectionCard
              title="Documents de livraison et ramassage"
              subtitle="Accès rapide aux archives, preuves, signatures, photos et documents liés."
            >
              <AppCard className="ui-stack-md">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto auto",
                    gap: "var(--ui-space-3)",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    className="tagora-input"
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                    placeholder="Chercher un dossier (client, commande, facture...)"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        goToArchives();
                      }
                    }}
                  />
                  <SecondaryButton onClick={() => goToArchives("")}>Ouvrir les archives</SecondaryButton>
                  <button
                    type="button"
                    className="tagora-dark-action"
                    onClick={() => goToArchives()}
                  >
                    Chercher un dossier
                  </button>
                </div>
              </AppCard>
            </SectionCard>
          </motion.section>
        ) : null}
      </div>
    </main>
  );
}
