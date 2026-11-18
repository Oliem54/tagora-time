import type { Metadata } from "next";
import AdminUsersPermissionsClient from "./AdminUsersPermissionsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs et permissions",
  description:
    "Console locale HORORA. Les rôles et permissions déjà enregistrés restent la seule autorité.",
};

export default function AdminUsersPermissionsPage() {
  return <AdminUsersPermissionsClient />;
}
