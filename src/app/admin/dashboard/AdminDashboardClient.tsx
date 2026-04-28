"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  FileStack,
  Files,
  ReceiptText,
  Sparkles,
  Truck,
  UsersRound,
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
import StatusBadge from "@/app/components/ui/StatusBadge";

type ModuleGroupId = "operations" | "administration";

type ModuleDefinition = {
  id: string;
  href: string;
  label: string;
  description: string;
  group: ModuleGroupId;
  icon: LucideIcon;
  accent: string;
  /** compteur Ameliorations (admin uniquement) */
  pendingKey?: "ameliorations";
};

const MODULE_GROUPS: { id: ModuleGroupId; title: string; subtitle: string }[] = [
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
    id: "livraisons",
    href: "/direction/livraisons",
    label: "Livraison et ramassage",
    description: "Planification et suivi des operations.",
    group: "operations",
    icon: Truck,
    accent:
      "linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "terrain",
    href: "/direction/terrain",
    label: "Terrain",
    description: "Carte en direct et equipes.",
    group: "operations",
    icon: Waypoints,
    accent:
      "linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "documents",
    href: "/direction/documents",
    label: "Documents",
    description: "Dossiers et pieces.",
    group: "operations",
    icon: Files,
    accent:
      "linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "ameliorations",
    href: "/ameliorations",
    label: "Ameliorations",
    description: "Suggestions et ameliorations a traiter.",
    group: "administration",
    icon: Sparkles,
    accent:
      "linear-gradient(135deg, rgba(234,179,8,0.2) 0%, rgba(15,41,72,0.08) 100%)",
    pendingKey: "ameliorations",
  },
  {
    id: "comptes",
    href: "/direction/demandes-comptes",
    label: "Gestion des comptes employes",
    description: "Acces et fiches employes.",
    group: "administration",
    icon: UsersRound,
    accent:
      "linear-gradient(135deg, rgba(244,114,182,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "horodateur",
    href: "/direction/horodateur",
    label: "Horodateur",
    description: "Quarts, pointage et anomalies.",
    group: "administration",
    icon: Clock3,
    accent:
      "linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "paie",
    href: "/direction/paie-compagnies",
    label: "Paie par compagnie",
    description: "Heures et couts par compagnie.",
    group: "administration",
    icon: ReceiptText,
    accent:
      "linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "facturation",
    href: "/direction/facturation-titan",
    label: "Facturation Titan",
    description: "Montants a facturer.",
    group: "administration",
    icon: FileStack,
    accent:
      "linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(15,41,72,0.08) 100%)",
  },
  {
    id: "ressources",
    href: "/direction/ressources",
    label: "Ressources",
    description: "Employes, flotte et referentiels.",
    group: "administration",
    icon: BriefcaseBusiness,
    accent:
      "linear-gradient(135deg, rgba(236,72,153,0.16) 0%, rgba(15,41,72,0.08) 100%)",
  },
];

export default function AdminDashboardClient() {
  const router = useRouter();
  const { user, loading } = useCurrentAccess();
  const [ameliorationsPending, setAmeliorationsPending] = useState<number | null>(null);

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
        const response = await fetch("/api/admin/ameliorations-pending-count", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.status === 403) {
          setAmeliorationsPending(null);
          return;
        }
        if (!response.ok) {
          setAmeliorationsPending(null);
          return;
        }
        const payload = (await response.json()) as { count?: number };
        if (cancelled) {
          return;
        }
        setAmeliorationsPending(typeof payload.count === "number" ? payload.count : null);
      } catch {
        if (!cancelled) {
          setAmeliorationsPending(null);
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
    if (m.pendingKey === "ameliorations" && ameliorationsPending != null && ameliorationsPending > 0) {
      return (
        <StatusBadge
          label={
            ameliorationsPending === 1
              ? "1 nouvelle"
              : `${ameliorationsPending} nouvelles`
          }
          tone="warning"
        />
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
      </div>
    </main>
  );
}
