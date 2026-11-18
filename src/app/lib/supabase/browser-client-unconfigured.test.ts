import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HORORA_PRODUCTION_SUPABASE_HOST,
  HORORA_PRODUCTION_SUPABASE_URL,
  HORORA_STAGING_SUPABASE_HOST,
} from "@/app/lib/supabase/supabase-host.shared";
import {
  HORORA_SUPABASE_UNCONFIGURED,
  createUnavailableBrowserSupabase,
  getBrowserSupabaseClient,
  probeSupabaseAuthSettingsReachable,
  readBrowserSupabaseConfig,
} from "@/app/lib/supabase/client";

const EMPTY_ENV = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
} as NodeJS.ProcessEnv;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browser Supabase client without configuration", () => {
  it("does not borrow the Production URL when the public URL is absent", () => {
    expect(readBrowserSupabaseConfig(EMPTY_ENV)).toBeNull();
    expect(
      readBrowserSupabaseConfig({
        ...EMPTY_ENV,
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
      })
    ).toBeNull();
  });

  it("keeps a present configuration, including the Production host guard", () => {
    expect(
      readBrowserSupabaseConfig({
        ...EMPTY_ENV,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
      })?.url
    ).toBe("http://127.0.0.1:9");
    expect(
      readBrowserSupabaseConfig({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `https://${HORORA_STAGING_SUPABASE_HOST}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
      })?.url
    ).toBe(HORORA_PRODUCTION_SUPABASE_URL);
  });

  it("refuses auth and queries without opening a connection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = getBrowserSupabaseClient(EMPTY_ENV) as ReturnType<
      typeof createUnavailableBrowserSupabase
    > & {
      auth: {
        getSession: () => Promise<{ data: { session: null }; error: { code: string } }>;
        getUser: () => Promise<{ data: { user: null } }>;
        signInWithPassword: () => Promise<{ data: { session: null; user: null } }>;
      };
      from: (table: string) => {
        select: () => Promise<{ data: null; error: { code: string } }>;
      };
    };

    const session = await client.auth.getSession();
    const user = await client.auth.getUser();
    const signIn = await client.auth.signInWithPassword();
    const query = await client.from("employees").select();

    expect(session.data.session).toBeNull();
    expect(session.error.code).toBe(HORORA_SUPABASE_UNCONFIGURED);
    expect(user.data.user).toBeNull();
    expect(signIn.data.session).toBeNull();
    expect(signIn.data.user).toBeNull();
    expect(query.data).toBeNull();
    expect(query.error.code).toBe(HORORA_SUPABASE_UNCONFIGURED);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(session)).not.toContain(HORORA_PRODUCTION_SUPABASE_HOST);
  });

  it("does not probe the network when Supabase is unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const probe = await probeSupabaseAuthSettingsReachable(EMPTY_ENV);
    expect(probe.ok).toBe(false);
    expect(probe.fetchErrorName).toBe(HORORA_SUPABASE_UNCONFIGURED);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
