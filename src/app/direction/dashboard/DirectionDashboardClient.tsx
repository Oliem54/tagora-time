"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  FileStack,
  Files,
  Route,
  Sparkles,
  TimerReset,
  Truck,
  ClipboardList,
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

type ModulePermission = "documents" | "livraisons" | "terrain" | "ressources" | null;
type ModuleGroupId = "operations" | "gestion";

type ModuleId =
  | "livraisons"
  | "horodateur"
  | "terrain"
  | "sorties-terrain"
  | "registre-heures"
  | "calendrier-effectifs"
  | "temps-titan"
  | "documents"
  | "ressources"
  | "gestion-comptes"
  | "ameliorations";

type ModuleDefinition = {
  id: ModuleId;
  href: string;
  label: string;
  description: string;
  permission: ModulePermission;
  group: ModuleGroupId;
  icon: LucideIcon;
  accent: string;
};

type ModuleGroup = {
  id: ModuleGroupId;
  title: string;
  subtitle: string;
};

const MODULE_GROUPS: ModuleGroup[] = [
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

const MODULES: ModuleDefinition[] = [
  {
    id: "livraisons",
    href: "/direction/livraisons",
    label: "Livraison & ramassage",
    description: "Planification livraisons et ramassages.",
    permission: "livraisons",
    group: "operations",
    icon: Truck,
    accent:
      "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "horodateur",
    href: "/direction/horodateur",
    label: "Horodateur",
    description: "Suivi live des punchs, pauses et exceptions.",
    permission: "terrain",
    group: "operations",
    icon: Clock3,
    accent:
      "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "registre-heures",
    href: "/direction/horodateur/registre",
    label: "Registre des heures",
    description: "Historique des quarts, punchs et exceptions.",
    permission: "terrain",
    group: "operations",
    icon: ClipboardList,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.2) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "calendrier-effectifs",
    href: "/direction/effectifs",
    label: "Calendrier des effectifs",
    description: "Couverture des équipes par département.",
    permission: "terrain",
    group: "operations",
    icon: ClipboardList,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.2) 0%, rgba(59,130,246,0.08) 100%)",
  },
  {
    id: "terrain",
    href: "/direction/terrain",
    label: "Terrain",
    description: "Carte en direct et equipes.",
    permission: "terrain",
    group: "operations",
    icon: Waypoints,
    accent:
      "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "sorties-terrain",
    href: "/direction/sorties-terrain",
    label: "Sorties terrain",
    description: "Kilomètres et temps.",
    permission: "terrain",
    group: "operations",
    icon: Route,
    accent:
      "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "temps-titan",
    href: "/direction/temps-titan",
    label: "Temps Titan",
    description: "Heures et refacturation.",
    permission: "terrain",
    group: "operations",
    icon: TimerReset,
    accent:
      "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "documents",
    href: "/direction/documents",
    label: "Documents",
    description: "Dossiers et pièces.",
    permission: "documents",
    group: "gestion",
    icon: Files,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "ressources",
    href: "/direction/ressources",
    label: "Ressources",
    description: "Employés et flotte.",
    permission: "ressources",
    group: "gestion",
    icon: BriefcaseBusiness,
    accent:
      "linear-gradient(135deg, rgba(236,72,153,0.16) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "gestion-comptes",
    href: "/direction/demandes-comptes",
    label: "Gestion des comptes",
    description: "Comptes employés, accès opérationnels et préférences d alertes.",
    permission: "ressources",
    group: "gestion",
    icon: FileStack,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(59,130,246,0.08) 100%)",
  },
  {
    id: "ameliorations",
    href: "/ameliorations",
    label: "Améliorations",
    description: "Suggestions, demandes d'amélioration et suivis internes.",
    permission: "ressources",
    group: "gestion",
    icon: Sparkles,
    accent:
      "linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(15,41,72,0.08) 100%)",
  },
];

export default function DirectionDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role, permissions, loading } = useCurrentAccess();
  const [archiveSearch, setArchiveSearch] = useState("");
  const [forceShowLoader, setForceShowLoader] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingAccountRequestsCount, setPendingAccountRequestsCount] = useState(0);
  const [pendingImprovementsCount, setPendingImprovementsCount] = useState(0);
  const [coverageAlertsCount, setCoverageAlertsCount] = useState(0);

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
    if (!accessToken || !user) {
      return;
    }

    const loadPendingBadges = async () => {
      try {
        const currentWeekStart = (() => {
          const today = new Date();
          const day = today.getDay();
          const shift = day === 0 ? -6 : 1 - day;
          const monday = new Date(today);
          monday.setDate(today.getDate() + shift);
          const y = monday.getFullYear();
          const m = String(monday.getMonth() + 1).padStart(2, "0");
          const d = String(monday.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        })();

        const [accountsResponse, improvementsResponse, effectifsResponse] = await Promise.all([
          fetch("/api/account-requests/pending-count", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }),
          fetch("/api/admin/ameliorations-pending-count", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }),
          fetch(`/api/direction/effectifs?weekStart=${encodeURIComponent(currentWeekStart)}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }),
        ]);

        if (accountsResponse.ok) {
          const accountsPayload = (await accountsResponse.json()) as { count?: unknown };
          const nextCount = Number(accountsPayload.count);
          setPendingAccountRequestsCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
        } else {
          setPendingAccountRequestsCount(0);
        }

        if (improvementsResponse.ok) {
          const improvementsPayload = (await improvementsResponse.json()) as { count?: unknown };
          const nextCount = Number(improvementsPayload.count);
          setPendingImprovementsCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
        } else {
          setPendingImprovementsCount(0);
        }

        if (effectifsResponse.ok) {
          const effectifsPayload = (await effectifsResponse.json()) as {
            summary?: { totalCoverageAlerts?: unknown };
          };
          const nextCount = Number(effectifsPayload.summary?.totalCoverageAlerts);
          setCoverageAlertsCount(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
        } else {
          setCoverageAlertsCount(0);
        }
      } catch {
        setPendingAccountRequestsCount(0);
        setPendingImprovementsCount(0);
        setCoverageAlertsCount(0);
      }
    };

    void loadPendingBadges();
  }, [accessToken, user]);

  const profileLoading = loading;
  const permissionsLoading = loading;
  const dashboardReady = !profileLoading && !permissionsLoading && Boolean(user);

  const visibleModules = useMemo(() => {
    const canSeeByRole = (module: ModuleDefinition) => {
      if (role === "admin") {
        return true;
      }
      if (role === "direction") {
        if (
          module.id === "livraisons" ||
          module.id === "horodateur" ||
          module.id === "terrain" ||
          module.id === "sorties-terrain" ||
          module.id === "registre-heures" ||
          module.id === "calendrier-effectifs" ||
          module.id === "temps-titan" ||
          module.id === "ameliorations"
        ) {
          return true;
        }
        if (module.id === "gestion-comptes") {
          return false;
        }
      }
      return module.permission ? permissions.includes(module.permission) : true;
    };

    return MODULES.filter((item) => canSeeByRole(item));
  }, [permissions, role]);

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
        ["/direction/demandes-comptes", pendingAccountRequestsCount],
        ["/ameliorations", pendingImprovementsCount],
        ["/direction/effectifs", coverageAlertsCount],
      ]),
    [coverageAlertsCount, pendingAccountRequestsCount, pendingImprovementsCount]
  );

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

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    // Debug dashboard visibility transitions without impacting prod.
    console.log("[dashboard modules]", {
      role,
      profileLoading,
      permissionsLoading,
      permissions,
      visibleModules: visibleModules.map((module) => module.id),
    });
  }, [permissions, permissionsLoading, profileLoading, role, visibleModules]);

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
                      <AppCard
                        className="ui-stack-md"
                        style={{
                          height: "100%",
                          minHeight: 262,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          border: "1px solid #dbe5f1",
                          boxShadow: "0 18px 38px rgba(15, 23, 42, 0.08)",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 100%)",
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
                              style={{
                                width: 52,
                                height: 52,
                                borderRadius: 16,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: item.accent,
                                border: "1px solid rgba(23,55,107,0.08)",
                                color: "#17376b",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
                              }}
                            >
                              <Icon size={24} strokeWidth={2.1} />
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
                                <span
                                  aria-label={`${notificationCountByHref.get(item.href)} en attente`}
                                  style={{
                                    minWidth: 22,
                                    height: 22,
                                    padding: "0 7px",
                                    borderRadius: 999,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: "#ffffff",
                                    background:
                                      "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                                    border: "1px solid rgba(127,29,29,0.22)",
                                    boxShadow:
                                      "0 6px 16px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.24)",
                                    flexShrink: 0,
                                  }}
                                >
                                  {notificationCountByHref.get(item.href)}
                                </span>
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
                          onClick={() => router.push(item.href)}
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

        {(dashboardReady ? visibleModules.some((module) => module.id === "livraisons") : true) ? (
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
