import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { selectVerifiedEmployeeCompany } from "@/app/lib/account-requests.shared";
import { HORORA_LOCAL_FIXTURE_SESSION_SOURCE } from "@/app/lib/auth/horora-local-nexus-fixture";
import { readReliableHororaSessionDisplay } from "@/app/lib/auth/horora-session-display.shared";
import { getEmployeeByAuthUserId } from "@/app/lib/horodateur-v1/repository";

export const dynamic = "force-dynamic";

let consolidatedProof: Promise<void> | null = null;

async function readVerifiedSessionCompany(
  authUserId: string,
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;
  try {
    const employee = await getEmployeeByAuthUserId(authUserId, { organizationId });
    return selectVerifiedEmployeeCompany({
      sessionOrganizationId: organizationId,
      employeeOrganizationId: employee?.organizationId ?? null,
      primaryCompany: employee?.primaryCompany ?? null,
    });
  } catch {
    return null;
  }
}

/**
 * Returns organization authorization context for AuthGate.
 * Serving session is accepted only from a verified Nexus handoff.
 * A preview-only flag records the consolidated directory proof in server logs.
 */
export async function GET(req: NextRequest) {
  try {
    if (process.env.HORORA_DIRECTORY_CONSOLIDATED_PROOF === "1" && !consolidatedProof) {
      consolidatedProof = import("@/app/lib/auth/horora-directory-nexus.server")
        .then(({ runConsolidatedDirectoryProof }) => runConsolidatedDirectoryProof())
        .then((proof) => {
          console.log(`HORORA_DIRECTORY_PROOF ${JSON.stringify(proof)}`);
        })
        .catch(() => {
          console.log(
            'HORORA_DIRECTORY_PROOF {"signedRequestSent":false,"failureDependency":"PROOF_FAILED"}'
          );
        });
    }
    if (consolidatedProof) await consolidatedProof;
    const authenticated = await getAuthenticatedRequestUser(req);
    const { user, sessionSource } = authenticated;
    if (
      !user ||
      (sessionSource !== "nexus_handoff" &&
        sessionSource !== HORORA_LOCAL_FIXTURE_SESSION_SOURCE) ||
      !authenticated.role ||
      !authenticated.organizationId ||
      !authenticated.membershipId
    ) {
      return NextResponse.json(
        { authenticated: false, authorized: false, reason: "unauthenticated", userId: null },
        { status: 401 }
      );
    }

    const display = readReliableHororaSessionDisplay(user);

    if (sessionSource === HORORA_LOCAL_FIXTURE_SESSION_SOURCE) {
      return NextResponse.json({
        authenticated: true,
        authorized: true,
        reason: null,
        userId: user.id,
        jwtAppRole: null,
        appRole: authenticated.role,
        organizationId: authenticated.organizationId,
        membershipId: authenticated.membershipId,
        membershipRole: authenticated.membershipRole,
        source: "local_nexus_fixture",
        displayName: display.displayName,
        email: display.email,
        company: null,
      });
    }

    const company = await readVerifiedSessionCompany(
      user.id,
      authenticated.organizationId
    );

    return NextResponse.json({
      authenticated: true,
      authorized: true,
      reason: null,
      userId: user.id,
      jwtAppRole: null,
      appRole: authenticated.role,
      organizationId: authenticated.organizationId,
      membershipId: authenticated.membershipId,
      membershipRole: authenticated.membershipRole,
      source: "nexus_handoff",
      displayName: display.displayName,
      email: display.email,
      company,
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, authorized: false, reason: "lookup_failed", userId: null },
      { status: 500 }
    );
  }
}
