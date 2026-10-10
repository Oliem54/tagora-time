import { NextRequest, NextResponse } from "next/server";
import { handleHororaRoleCatalogGet } from "@/app/lib/auth/horora-role-consent.server";
import {
  HORORA_ROLE_CATALOG_AUDIENCE,
  verifyTagoraRoleConsentV1,
} from "@/app/lib/auth/horora-role-consent-token.server";
import { extractNexusHandoffToken } from "@/app/lib/auth/nexus-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = extractNexusHandoffToken({
    searchParams: request.nextUrl.searchParams,
  });
  const result = await handleHororaRoleCatalogGet({
    token,
    verify: (token) =>
      verifyTagoraRoleConsentV1(token, { audience: HORORA_ROLE_CATALOG_AUDIENCE }),
  });
  return NextResponse.json(result.body, { status: result.status });
}
