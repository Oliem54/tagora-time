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

export function mappingHttpStatusError(status: number): Error {
  const code =
    Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : "000";
  return new Error(`mapping_http_${code}`);
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
  const headers = lockMappingOutboundHeaders(headersFromRecord(input.headers));
  const response = await request(input.url, {
    method: input.method,
    headers,
    body: input.body,
    dispatcher: mappingAgent,
  });
  return {
    status: response.statusCode,
    bodyText: await response.body.text(),
  };
};

function headersFromRecord(headers: Record<string, string>): Headers {
  const source = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    source.set(name, value);
  }
  return source;
}
