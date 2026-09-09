/**
 * Employee punch APIs authenticate from the Nexus-brokered HORORA cookie.
 * Do not require a Supabase Auth JWT in the browser.
 */

export function employeePunchRequestInit(init: RequestInit = {}): RequestInit {
  return {
    cache: "no-store",
    ...init,
    credentials: "same-origin",
  };
}
