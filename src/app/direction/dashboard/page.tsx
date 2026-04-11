import DirectionDashboardClient from "./DirectionDashboardClient";
import { createAdminSupabaseClient } from "../../lib/supabase/admin";

export const dynamic = "force-dynamic";

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
