import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";

export async function commissionsFetch(input: string, init?: RequestInit) {
  const nexusInit = hororaNexusSessionRequestInit(init);
  const headers = new Headers(nexusInit.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...nexusInit, headers });
}
