import { NextRequest, NextResponse } from "next/server";
import { createHororaRoleAcknowledgementStore } from "@/app/lib/auth/horora-role-acknowledgement-store.server";
import { handleHororaRoleAssignmentPost } from "@/app/lib/auth/horora-role-consent.server";
import {
  HORORA_ROLE_ASSIGNMENT_AUDIENCE,
  verifyTagoraRoleConsentV1,
} from "@/app/lib/auth/horora-role-consent-token.server";
import { createNexusMappingLookups } from "@/app/lib/auth/nexus-mapping-postgrest.server";
import { extractNexusHandoffToken } from "@/app/lib/auth/nexus-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const token = extractNexusHandoffToken({ body });
  try {
    const result = await handleHororaRoleAssignmentPost({
      token,
      body,
      verify: (token) =>
        verifyTagoraRoleConsentV1(token, {
          audience: HORORA_ROLE_ASSIGNMENT_AUDIENCE,
        }),
      lookups: createNexusMappingLookups(),
      store: createHororaRoleAcknowledgementStore(),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      { ok: false, reasonCode: "MODULE_REFUSED" },
      { status: 403 }
    );
  }
}
