import { NextRequest, NextResponse } from "next/server";
import {
  getAccountRequestsRequestDebug,
  getStrictDirectionRequestUser,
} from "@/app/lib/account-requests.server";
import { loadEmployeeAccountsRegistry } from "@/app/lib/employee-accounts-registry.server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestDebug = getAccountRequestsRequestDebug(req);

  try {
    if (!requestDebug.hasClientMarker) {
      return NextResponse.json(
        {
          error:
            "Appel refuse: requete non marquee comme navigateur authentifie.",
        },
        { status: 400 }
      );
    }

    const { user, role, mfaError } = await getStrictDirectionRequestUser(req);
    if (mfaError) return mfaError;

    if (!user || (role !== "direction" && role !== "admin")) {
      return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
    }

    const entries = await loadEmployeeAccountsRegistry();

    return NextResponse.json({
      entries,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur chargement registre comptes employes.",
      },
      { status: 500 }
    );
  }
}
