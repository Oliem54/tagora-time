import type { Metadata } from "next";
import AdminUsersPermissionsClient from "./AdminUsersPermissionsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs et permissions",
  description:
    "Préparation locale de l'annuaire HORORA. Aucun enregistrement et aucun accès Nexus en direct.",
};

export default function AdminUsersPermissionsPage() {
  return <AdminUsersPermissionsClient />;
}
