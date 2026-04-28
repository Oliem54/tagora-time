"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FileStack,
  Files,
  Route,
  TimerReset,
  Truck,
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

type ModuleDefinition = {
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
    href: "/direction/demandes-comptes",
    label: "Gestion des comptes",
    description: "Comptes employés, accès opérationnels et préférences d alertes.",
    permission: "ressources",
    group: "gestion",
    icon: FileStack,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(59,130,246,0.08) 100%)",
  },
];

export default function DirectionDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, hasPermission } = useCurrentAccess();
  const [archiveSearch, setArchiveSearch] = useState("");
  const [forceShowLoader, setForceShowLoader] = useState(false);

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

  const visibleModules = useMemo(
    () => MODULES.filter((item) => (item.permission ? hasPermission(item.permission) : true)),
    [hasPermission]
  );

  const groupedModules = useMemo(
    () =>
      MODULE_GROUPS.map((group) => ({
        ...group,
        modules: visibleModules.filter((item) => item.group === group.id),
      })).filter((group) => group.modules.length > 0),
    [visibleModules]
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
