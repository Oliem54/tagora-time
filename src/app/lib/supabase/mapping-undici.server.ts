/**
 * Nexus mapping HTTP, isolated from the Next.js patched global fetch.
 *
 * The patched fetch can forward the inbound browser User-Agent. Supabase
 * then answers 401 for an sb_secret key. This module rebuilds an allowlisted
 * header set and sends it with undici's own request and Agent.
 */

import { Agent, request } from "undici";
import {
  HORORA_MAPPING_USER_AGENT,
  isHororaServiceRoleJwt,
} from "@/app/lib/supabase/service-role-postgrest.shared";

const mappingAgent = new Agent();

const FORWARDED_HEADER_NAMES = ["accept", "apikey", "content-type", "prefer"] as const;

export type MappingDispatchInput = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

export type MappingDispatchResult = {
  status: number;
  bodyText: string;
};

export type MappingDispatch = (
  input: MappingDispatchInput
) => Promise<MappingDispatchResult>;

export const MAPPING_ERROR_KINDS = [
  "mapping_transport_error",
  "mapping_runtime_error",
  "mapping_url_error",
  "mapping_header_error",
  "mapping_config_error",
  "mapping_http_401",
  "mapping_http_error",
] as const;

export type MappingErrorKind = (typeof MAPPING_ERROR_KINDS)[number];

export class MappingClientError extends Error {
  readonly errorKind: MappingErrorKind;
  readonly httpStatus?: string;

  constructor(errorKind: MappingErrorKind, httpStatus?: string) {
    super(errorKind);
    this.name = "MappingClientError";
    this.errorKind = errorKind;
    this.httpStatus = httpStatus;
  }
}

export function mappingHttpStatusError(status: number): MappingClientError {
  const code = sanitizedMappingHttpStatus(status);
  if (code === "401") return new MappingClientError("mapping_http_401", code);
  const numeric = Number(code);
  if (numeric >= 200 && numeric < 300) {
    return new MappingClientError("mapping_runtime_error", code);
  }
  if (numeric < 100 || numeric > 599) {
    return new MappingClientError("mapping_runtime_error");
  }
  return new MappingClientError("mapping_http_error", code);
}

export function sanitizedMappingHttpStatus(status: number): string {
  if (!Number.isInteger(status) || status < 100 || status > 599) return "000";
  return String(status);
}

export function classifyMappingClientError(error: unknown): { error_kind: MappingErrorKind } {
  if (error instanceof MappingClientError) return { error_kind: error.errorKind };
  if (!(error instanceof Error)) return { error_kind: "mapping_runtime_error" };

  const code = readErrorCode(error);
  const name = error.name;
  if (
    code === "UND_ERR_INVALID_ARG" ||
    name === "InvalidArgumentError" ||
    /invalid header|header value|invalid value/i.test(error.message)
  ) {
    return { error_kind: "mapping_header_error" };
  }
  if (code === "ERR_INVALID_URL" || name === "URIError" || /invalid url/i.test(error.message)) {
    return { error_kind: "mapping_url_error" };
  }
  if (/cannot assume service_role|missing supabase_service_role_key|missing next_public_supabase_url/i.test(error.message)) {
    return { error_kind: "mapping_config_error" };
  }
  if (isTransportError(error)) return { error_kind: "mapping_transport_error" };

  const cause = (error as { cause?: unknown }).cause;
  if (cause && cause !== error) {
    const nested = classifyMappingClientError(cause);
    if (nested.error_kind !== "mapping_runtime_error") return nested;
  }
  if (error.message === "fetch failed") return { error_kind: "mapping_transport_error" };
  return { error_kind: "mapping_runtime_error" };
}

export function toMappingClientError(error: unknown): MappingClientError {
  if (error instanceof MappingClientError) return error;
  return new MappingClientError(classifyMappingClientError(error).error_kind);
}

function readErrorCode(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function isTransportError(error: Error): boolean {
  const code = readErrorCode(error);
  if (code.startsWith("UND_ERR") && code !== "UND_ERR_INVALID_ARG") return true;
  if (
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "EPIPE"
  ) {
    return true;
  }
  return error.name === "SocketError" || error.name.includes("Connect");
}

export function lockMappingOutboundHeaders(source: Headers): Record<string, string> {
  const locked: Record<string, string> = {};
  for (const name of FORWARDED_HEADER_NAMES) {
    const value = source.get(name);
    if (value) locked[name] = value;
  }

  const apikey = locked.apikey ?? "";
  const authorization = source.get("authorization");
  if (!apikey.startsWith("sb_secret_") && authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (isHororaServiceRoleJwt(token)) {
      locked.authorization = `Bearer ${token}`;
    }
  }

  locked["user-agent"] = HORORA_MAPPING_USER_AGENT;
  locked["x-client-info"] = HORORA_MAPPING_USER_AGENT;
  return locked;
}

export const dispatchMappingWithUndici: MappingDispatch = async (input) => {
  let headers: Record<string, string>;
  try {
    headers = lockMappingOutboundHeaders(headersFromRecord(input.headers));
  } catch {
    throw new MappingClientError("mapping_header_error");
  }
  let statusCode: number | undefined;
  try {
    const response = await request(input.url, {
      method: input.method,
      headers,
      body: input.body,
      dispatcher: mappingAgent,
    });
    statusCode = response.statusCode;
    return {
      status: statusCode,
      bodyText: await response.body.text(),
    };
  } catch (error) {
    if (typeof statusCode === "number") throw mappingHttpStatusError(statusCode);
    throw toMappingClientError(error);
  }
};

function headersFromRecord(headers: Record<string, string>): Headers {
  const source = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    source.set(name, value);
  }
  return source;
}
