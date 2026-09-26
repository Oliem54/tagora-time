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
  const message = error.message.toLowerCase().trim();
  if (
    message === "mapping_transport_error" ||
    message === "mapping_runtime_error" ||
    message === "mapping_url_error" ||
    message === "mapping_header_error" ||
    message === "mapping_config_error" ||
    message === "mapping_http_401" ||
    message === "mapping_http_error"
  ) {
    return message;
  }
  if (message.includes("cannot assume service_role")) return "mapping_config_error";
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
  if (message.includes("pgrst205") || message.includes("schema cache")) {
    return "database_relation_missing";
  }
  if (message.includes("permission denied") || message.includes("rls")) {
    return "mapping_permission_denied";
  }
  const httpStatus = message.match(/^mapping_http_(\d{3})$/);
  if (httpStatus) return httpStatus[1] === "401" ? "mapping_http_401" : "mapping_http_error";
  if (message.includes("forbidden use of secret api key")) return "mapping_http_401";
  if (message.includes("jwt") || message.includes("invalid api key")) {
    return "supabase_auth_config_error";
  }
  if (
    message.includes("refused unknown supabase host") ||
    message.includes("refused staging supabase")
  ) {
    return "supabase_host_not_production";
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
    code === "mapping_permission_denied" ||
    code === "supabase_auth_config_error" ||
    code === "supabase_url_missing" ||
    code === "supabase_service_role_missing" ||
    code === "supabase_host_not_production" ||
    code === "mapping_transport_error" ||
    code === "mapping_runtime_error" ||
    code === "mapping_url_error" ||
    code === "mapping_header_error" ||
    code === "mapping_config_error" ||
    code === "mapping_http_401" ||
    code === "mapping_http_error" ||
    /^http_\d{3}$/.test(code)
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
