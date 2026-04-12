import type { Metadata } from "next";
import DirectionDashboardClient from "./DirectionDashboardClient";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tableau de bord direction",
  description: "Acces direction Tagora.",
};

export default async function DirectionDashboardPage() {
  let pendingAccountsCount = 0;

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

  return (
    <DirectionDashboardClient pendingAccountsCount={pendingAccountsCount} />
  );
}
