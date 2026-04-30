import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { countPendingAppImprovements } from "@/app/lib/app-improvements-pending.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, role } = await getAuthenticatedRequestUser(req);

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (role !== "admin" && role !== "direction") {
    return NextResponse.json(
      { error: "Acces reserve a la direction et aux administrateurs." },
      { status: 403 }
    );
  }

  const { count, hadError } = await countPendingAppImprovements();
  return NextResponse.json({ count, hadError });
}
