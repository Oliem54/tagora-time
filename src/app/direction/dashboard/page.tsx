import type { Metadata } from "next";
import DirectionDashboardClient from "./DirectionDashboardClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tableau de bord direction",
  description: "Acces direction Tagora.",
};

export default function DirectionDashboardPage() {
  return <DirectionDashboardClient />;
}
