/**
 * Employee punch APIs authenticate from the Nexus-brokered HORORA cookie.
 * Do not require a Supabase Auth JWT in the browser.
 */

import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";

export function employeePunchRequestInit(init: RequestInit = {}): RequestInit {
  return hororaNexusSessionRequestInit(init);
}
