import type { Metadata } from "next";
import DirectionDashboardClient from "./DirectionDashboardClient";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";
import { getDirectionDashboardHorodateurAlerts } from "@/app/lib/horodateur-v1/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tableau de bord direction",
  description: "Acces direction Tagora.",
};

export default async function DirectionDashboardPage() {
  let pendingAccountsCount = 0;
  let pendingHorodateurExceptionsCount = 0;
  let pendingHorodateurExceptions: Awaited<
    ReturnType<typeof getDirectionDashboardHorodateurAlerts>
  >["items"] = [];

  try {
    const supabase = createAdminSupabaseClient();
    const { count } = await supabase
      .from("account_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    pendingAccountsCount = count ?? 0;
  } catch {
    pendingAccountsCount = 0;
  }

  try {
    const horodateurAlerts = await getDirectionDashboardHorodateurAlerts();
    pendingHorodateurExceptionsCount = horodateurAlerts.pendingCount;
    pendingHorodateurExceptions = horodateurAlerts.items;
  } catch {
    pendingHorodateurExceptionsCount = 0;
    pendingHorodateurExceptions = [];
  }

  return (
    <DirectionDashboardClient
      pendingAccountsCount={pendingAccountsCount}
      pendingHorodateurExceptionsCount={pendingHorodateurExceptionsCount}
      pendingHorodateurExceptions={pendingHorodateurExceptions}
    />
  );
}
