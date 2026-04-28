import type { Metadata } from "next";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tableau de bord administrateur",
  description: "Outils d administration Tagora Time.",
};

export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}
