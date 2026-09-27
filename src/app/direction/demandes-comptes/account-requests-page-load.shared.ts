import { hororaNexusSessionRequestInit } from "@/app/lib/auth/horora-nexus-session.client";

export const ACCOUNT_REQUESTS_BROWSER_MARKER_HEADER = "x-account-requests-client";
export const ACCOUNT_REQUESTS_BROWSER_MARKER_VALUE = "browser-authenticated";
export const ACCOUNT_REQUESTS_PAGE_HEADER = "x-account-requests-page";
export const ACCOUNT_REQUESTS_PAGE_VALUE = "direction-demandes-comptes";

export const ACCOUNT_REQUESTS_FORBIDDEN_MESSAGE =
  "Accès refusé. Cette session ne peut pas consulter les demandes de comptes.";
export const ACCOUNT_REQUESTS_SERVER_ERROR_MESSAGE =
  "Le serveur n'a pas pu charger les demandes de comptes.";
export const ACCOUNT_REQUESTS_LOAD_ERROR_MESSAGE =
  "Impossible de charger les demandes pour le moment.";
export const ACCOUNT_REQUESTS_TIMEOUT_MESSAGE =
  "Le chargement des demandes a dépassé le délai prévu.";
export const ACCOUNT_REQUESTS_LOAD_TIMEOUT_MS = 12_000;

export type AccountRequestsPageLoad =
  | { ok: true; requests: unknown[] }
  | {
      ok: false;
      kind: "forbidden" | "server_error" | "error";
      message: string;
      retry: true;
    };

/**
 * Nexus handoff does not create a Supabase browser JWT.
 * The list call authenticates with the brokered cookie only.
 */
export function accountRequestsBrowserInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(ACCOUNT_REQUESTS_BROWSER_MARKER_HEADER, ACCOUNT_REQUESTS_BROWSER_MARKER_VALUE);
  headers.set(ACCOUNT_REQUESTS_PAGE_HEADER, ACCOUNT_REQUESTS_PAGE_VALUE);
  headers.delete("Authorization");
  return hororaNexusSessionRequestInit({
    ...init,
    headers,
  });
}

export function interpretAccountRequestsPageLoad(
  status: number,
  payload: unknown
): AccountRequestsPageLoad {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      kind: "forbidden",
      message: ACCOUNT_REQUESTS_FORBIDDEN_MESSAGE,
      retry: true,
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      kind: "server_error",
      message: ACCOUNT_REQUESTS_SERVER_ERROR_MESSAGE,
      retry: true,
    };
  }

  if (status < 200 || status >= 300) {
    return {
      ok: false,
      kind: "error",
      message: ACCOUNT_REQUESTS_LOAD_ERROR_MESSAGE,
      retry: true,
    };
  }

  const requests =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { requests?: unknown }).requests)
      ? (payload as { requests: unknown[] }).requests
      : [];

  return { ok: true, requests };
}

/** A missing Supabase access token must not pin the page on its initial spinner. */
export function shouldKeepAccountRequestsPageLoading(phase: "loading" | "settled"): boolean {
  return phase === "loading";
}

export function isAccountRequestsViewerAllowed(role: string | null | undefined): boolean {
  return role === "admin" || role === "direction";
}

export type AccountRequestsLoadSettlement = {
  requests: unknown[];
  loading: false;
  errorMessage: string | null;
  denied: boolean;
  timedOut: boolean;
  unauthenticated: boolean;
};

function settleAccountRequestsLoad(
  partial: Partial<Omit<AccountRequestsLoadSettlement, "loading">>
): AccountRequestsLoadSettlement {
  return {
    requests: partial.requests ?? [],
    errorMessage: partial.errorMessage ?? null,
    denied: partial.denied ?? false,
    timedOut: partial.timedOut ?? false,
    unauthenticated: partial.unauthenticated ?? false,
    loading: false,
  };
}

export async function loadAccountRequestsPage(input: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<AccountRequestsLoadSettlement> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? ACCOUNT_REQUESTS_LOAD_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await Promise.race([
      fetchImpl(
        "/api/account-requests",
        accountRequestsBrowserInit({ method: "GET", signal: controller.signal })
      ),
      new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
    ]);
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      return settleAccountRequestsLoad({
        unauthenticated: true,
        denied: true,
        errorMessage: ACCOUNT_REQUESTS_FORBIDDEN_MESSAGE,
      });
    }

    const outcome = interpretAccountRequestsPageLoad(response.status, payload);
    if (!outcome.ok) {
      return settleAccountRequestsLoad({
        denied: outcome.kind === "forbidden",
        errorMessage: outcome.message,
      });
    }

    return settleAccountRequestsLoad({ requests: outcome.requests });
  } catch {
    const timedOut = controller.signal.aborted;
    return settleAccountRequestsLoad({
      timedOut,
      errorMessage: timedOut
        ? ACCOUNT_REQUESTS_TIMEOUT_MESSAGE
        : ACCOUNT_REQUESTS_LOAD_ERROR_MESSAGE,
    });
  } finally {
    clearTimeout(timer);
  }
}
