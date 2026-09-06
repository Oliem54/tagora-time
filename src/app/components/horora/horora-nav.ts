import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarRange,
  Clock3,
  FileSpreadsheet,
  LayoutDashboard,
  Users,
  UserRound,
  Wallet,
} from "lucide-react";

export type HororaWorkspace = "employe" | "direction" | "admin";

export type HororaNavId =
  | "dashboard"
  | "punch"
  | "profil"
  | "live"
  | "registre"
  | "quarts"
  | "paie"
  | "effectifs"
  | "comptes"
  | "employes";

export type HororaNavItem = {
  id: HororaNavId;
  href: string;
  label: string;
  icon: LucideIcon;
};

const EMPLOYEE_NAV: HororaNavItem[] = [
  { id: "dashboard", href: "/employe/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "punch", href: "/employe/horodateur", label: "Pointage", icon: Clock3 },
  { id: "profil", href: "/employe/profil", label: "Profil", icon: UserRound },
];

const DIRECTION_NAV: HororaNavItem[] = [
  { id: "dashboard", href: "/direction/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "live", href: "/direction/horodateur", label: "Horodateur live", icon: Activity },
  { id: "registre", href: "/direction/horodateur/registre", label: "Registre", icon: FileSpreadsheet },
  { id: "quarts", href: "/direction/horodateur/quarts", label: "Quarts passés", icon: CalendarRange },
  { id: "paie", href: "/direction/horodateur/rapport-comptable", label: "Rapport comptable", icon: Wallet },
  { id: "effectifs", href: "/direction/effectifs", label: "Effectifs", icon: Users },
  { id: "comptes", href: "/direction/demandes-comptes", label: "Comptes", icon: UserRound },
];

const ADMIN_NAV: HororaNavItem[] = [
  { id: "dashboard", href: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "live", href: "/direction/horodateur", label: "Horodateur live", icon: Activity },
  { id: "registre", href: "/direction/horodateur/registre", label: "Registre", icon: FileSpreadsheet },
  { id: "quarts", href: "/direction/horodateur/quarts", label: "Quarts passés", icon: CalendarRange },
  { id: "paie", href: "/direction/horodateur/rapport-comptable", label: "Rapport comptable", icon: Wallet },
  { id: "employes", href: "/direction/ressources/employes", label: "Employés", icon: Users },
  { id: "comptes", href: "/direction/demandes-comptes", label: "Comptes", icon: UserRound },
];

export function hororaNavForWorkspace(workspace: HororaWorkspace): HororaNavItem[] {
  if (workspace === "employe") return EMPLOYEE_NAV;
  if (workspace === "admin") return ADMIN_NAV;
  return DIRECTION_NAV;
}

export function hororaWorkspaceHome(workspace: HororaWorkspace): string {
  if (workspace === "employe") return "/employe/dashboard";
  if (workspace === "admin") return "/admin/dashboard";
  return "/direction/dashboard";
}

export function hororaWorkspaceLabel(workspace: HororaWorkspace): string {
  if (workspace === "employe") return "Employé";
  if (workspace === "admin") return "Admin";
  return "Direction";
}
