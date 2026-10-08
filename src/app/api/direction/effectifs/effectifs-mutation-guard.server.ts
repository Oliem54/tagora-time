import { NextResponse } from "next/server";

/**
 * A Nexus handoff cookie may read Effectifs. It is not write authorization.
 * Effectifs mutations stay closed unless a later explicit guard allows them.
 */
export function nexusHandoffBlocksEffectifsMutation(
  sessionSource: string | null | undefined
): boolean {
  return sessionSource === "nexus_handoff";
}

export function nexusHandoffEffectifsMutationResponse(
  sessionSource: string | null | undefined
): NextResponse | null {
  if (!nexusHandoffBlocksEffectifsMutation(sessionSource)) return null;
  return NextResponse.json(
    { error: "Modification des effectifs refusée pour cette session." },
    { status: 403 }
  );
}
