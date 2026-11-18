import {
  HORORA_PRODUCTION_SUPABASE_HOST,
  HORORA_STAGING_SUPABASE_HOST,
  readSupabaseHostname,
} from "@/app/lib/supabase/supabase-host.shared";

/** Empty Vercel project created for fictional HORORA Premium QA. */
export const HORORA_SYNTHETIC_PREVIEW_PROJECT_ID =
  "prj_7GMiNslQIerFcLdB2lUNybABFVVP" as const;

export const HORORA_SYNTHETIC_PREVIEW_PROJECT_NAME =
  "tagora-horora-premium-2027-mock-qa" as const;

export type HororaSyntheticPreviewInput = {
  readonly vercelProjectId: string | null | undefined;
  readonly vercelEnv: string | null | undefined;
  readonly hostname: string | null | undefined;
  readonly supabaseUrl: string | null | undefined;
  readonly serviceRoleKeyPresent: boolean;
};

/**
 * Eligibility for a future fictional preview. This function does not
 * authenticate anyone and does not open the local fixture on a public host.
 */
export function isHororaSyntheticPreviewProjectEligible(
  input: HororaSyntheticPreviewInput
): boolean {
  if (input.vercelProjectId !== HORORA_SYNTHETIC_PREVIEW_PROJECT_ID) return false;
  if (input.vercelEnv?.trim().toLowerCase() !== "preview") return false;
  if (input.serviceRoleKeyPresent) return false;

  const host = input.hostname?.trim().toLowerCase() ?? "";
  if (
    host === "time.tagora.ca" ||
    host === "time.staging.tagora.ca" ||
    host === "tagora-time-staging.vercel.app" ||
    host.startsWith("tagora-time-staging-")
  ) {
    return false;
  }

  const supabaseHost = readSupabaseHostname(input.supabaseUrl);
  if (
    supabaseHost === HORORA_PRODUCTION_SUPABASE_HOST ||
    supabaseHost === HORORA_STAGING_SUPABASE_HOST
  ) {
    return false;
  }

  return true;
}
