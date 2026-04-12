import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const FOUNDER_EMAIL = "mstgelais@oliem.ca";
const FOUNDER_PERMISSIONS = [
  "documents",
  "dossiers",
  "terrain",
  "livraisons",
  "ressources",
];

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const founderPassword = requireEnv("BOOTSTRAP_FOUNDER_PASSWORD");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

function buildFounderMetadata(existingMetadata = {}) {
  return {
    ...existingMetadata,
    role: "direction",
    permissions: FOUNDER_PERMISSIONS,
  };
}

async function main() {
  console.log("Bootstrap founder admin started", {
    email: FOUNDER_EMAIL,
    permissions: FOUNDER_PERMISSIONS,
  });

  const users = await listAllUsers();
  const existingUser =
    users.find((user) => user.email?.toLowerCase() === FOUNDER_EMAIL) ?? null;

  if (!existingUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: FOUNDER_EMAIL,
      password: founderPassword,
      email_confirm: true,
      app_metadata: buildFounderMetadata(),
      user_metadata: buildFounderMetadata(),
    });

    if (error) {
      throw error;
    }

    console.log("Founder admin created", {
      id: data.user?.id ?? null,
      email: data.user?.email ?? null,
      role: data.user?.app_metadata?.role ?? null,
    });

    return;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
    password: founderPassword,
    email_confirm: true,
    app_metadata: buildFounderMetadata(existingUser.app_metadata ?? {}),
    user_metadata: buildFounderMetadata(existingUser.user_metadata ?? {}),
  });

  if (error) {
    throw error;
  }

  console.log("Founder admin promoted", {
    id: data.user?.id ?? existingUser.id,
    email: data.user?.email ?? existingUser.email ?? null,
    role: data.user?.app_metadata?.role ?? "direction",
  });
}

main().catch((error) => {
  console.error("Bootstrap founder admin failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
