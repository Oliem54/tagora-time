import { describe, expect, it } from "vitest";
import {
  isMappingStoreUnavailableError,
  sanitizeMappingStoreError,
} from "@/app/lib/auth/nexus-callback-logging.shared";
import {
  NEXUS_STAGING_PORTAL_MODULES_URL,
  publicNexusCallbackDenyReason,
  resolveNexusDeniedReturnUrl,
  resolveNexusPortalReturnUrl,
} from "@/app/lib/auth/nexus-handoff-config";

describe("Nexus callback logging and deny UX", () => {
  it("classifies missing map tables without leaking query text", () => {
    expect(
      sanitizeMappingStoreError(
        new Error('relation "public.horora_nexus_identity_map" does not exist')
      )
    ).toBe("identity_map_table_missing");
    expect(
      isMappingStoreUnavailableError(
        new Error('relation "public.horora_nexus_identity_map" does not exist')
      )
    ).toBe(true);
  });

  it("classifies permission denied without leaking the query", () => {
    expect(
      sanitizeMappingStoreError(
        new Error("permission denied for table horora_nexus_identity_map")
      )
    ).toBe("mapping_permission_denied");
  });

  it("classifies Production host refusal without leaking the URL", () => {
    expect(
      sanitizeMappingStoreError(
        new Error("Production HORORA refused unknown Supabase host")
      )
    ).toBe("supabase_host_not_production");
    expect(
      isMappingStoreUnavailableError(
        new Error("Production HORORA refused unknown Supabase host")
      )
    ).toBe(true);
  });

  it("maps mapping_unavailable to a distinct public deny reason", () => {
    expect(publicNexusCallbackDenyReason("mapping_unavailable")).toBe(
      "mapping_unavailable"
    );
  });

  it("always resolves the denied return link to absolute Nexus modules", () => {
    expect(
      resolveNexusDeniedReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
      })
    ).toBe("https://tagora-nexus-staging.vercel.app/modules");
    expect(resolveNexusDeniedReturnUrl({})).toBe(NEXUS_STAGING_PORTAL_MODULES_URL);
    expect(resolveNexusDeniedReturnUrl({ VERCEL_ENV: "production" })).toBe(
      "https://app.tagora.ca/modules"
    );
    expect(
      resolveNexusPortalReturnUrl({
        NEXUS_PORTAL_RETURN_URL: "https://tagora-nexus-staging.vercel.app/modules",
      })
    ).toEqual({
      ok: true,
      url: "https://tagora-nexus-staging.vercel.app/modules",
    });
  });
});
