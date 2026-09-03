export type NexusCallbackStage =
  | "extract_token"
  | "verify_config"
  | "verify_jwks"
  | "verify_signature"
  | "identity_mapping"
  | "binding_consistency"
  | "replay_consume"
  | "session_mint";

export function sanitizeMappingStoreError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown_error";
  const message = error.message.toLowerCase();
  if (message.includes("missing next_public_supabase_url")) {
    return "supabase_url_missing";
  }
  if (message.includes("missing supabase_service_role_key")) {
    return "supabase_service_role_missing";
  }
  if (message.includes("horora_nexus_identity_map") && message.includes("does not exist")) {
    return "identity_map_table_missing";
  }
  if (message.includes("horora_nexus_organization_map") && message.includes("does not exist")) {
    return "organization_map_table_missing";
  }
  if (message.includes("does not exist")) {
    return "database_relation_missing";
  }
  return "mapping_store_error";
}

export function isMappingStoreUnavailableError(error: unknown): boolean {
  const code = sanitizeMappingStoreError(error);
  return (
    code === "identity_map_table_missing" ||
    code === "organization_map_table_missing" ||
    code === "database_relation_missing" ||
    code === "mapping_store_error" ||
    code === "supabase_url_missing" ||
    code === "supabase_service_role_missing"
  );
}

export function logNexusCallbackClosed(input: {
  stage: NexusCallbackStage;
  reason_code: string;
  detail?: string;
  logger?: (message: string, fields: Record<string, string>) => void;
}): void {
  const logger =
    input.logger ??
    ((message, fields) => {
      console.info(message, fields);
    });
  const fields: Record<string, string> = {
    decision: "closed",
    stage: input.stage,
    reason_code: input.reason_code,
  };
  if (input.detail) {
    fields.detail = input.detail;
  }
  logger("[horora.nexus.callback]", fields);
}
