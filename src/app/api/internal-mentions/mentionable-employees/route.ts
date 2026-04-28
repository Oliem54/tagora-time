import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

type MentionableRecipient = {
  id: string;
  name: string;
  email: string | null;
  roleLabel: string | null;
  active: boolean;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoleLabel(value: unknown) {
  const role = asText(value).toLowerCase();
  if (role === "admin") return "Admin";
  if (role === "direction" || role === "manager") return "Direction";
  if (role === "employe" || role === "employee" || role === "chauffeur") return "Employe";
  return "Interne";
}

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    const { user, role } = await getAuthenticatedRequestUser(req);
    console.info("[mentionable-employees] auth", {
      hasUser: Boolean(user),
      role: role ?? null,
    });
    if (!user || !role) {
      return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    }
    if (role !== "direction" && role !== "admin") {
      console.info("[mentionable-employees] forbidden", { role });
      return NextResponse.json({ error: "Acces reserve direction/admin." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: chauffeursDataRaw, error: chauffeursError } = await supabase
      .from("chauffeurs")
      .select("id, nom, nom_complet, courriel, actif")
      .neq("actif", false)
      .order("id", { ascending: true });

    const chauffeursData = chauffeursError ? [] : (chauffeursDataRaw ?? []);
    if (chauffeursError) {
      console.error("[mentionable-employees] chauffeurs error", {
        message: chauffeursError.message,
        code: chauffeursError.code,
        details: chauffeursError.details,
        hint: chauffeursError.hint,
      });
    }

    const { data: accountRequestsDataRaw, error: accountRequestsError } = await supabase
      .from("account_requests")
      .select("id, invited_user_id, email, full_name, assigned_role, requested_role, status")
      .in("status", ["active", "invited", "pending"])
      .order("created_at", { ascending: false })
      .limit(3000);

    const accountRequestsData = accountRequestsError ? [] : (accountRequestsDataRaw ?? []);
    if (accountRequestsError) {
      console.error("[mentionable-employees] account_requests error", {
        message: accountRequestsError.message,
        code: accountRequestsError.code,
        details: accountRequestsError.details,
        hint: accountRequestsError.hint,
      });
    }

    const authRecipients: MentionableRecipient[] = [];
    let authUsersCount = 0;
    let page = 1;
    const perPage = 500;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("[mentionable-employees] auth_users error", {
          message: error.message,
          code: error.code,
        });
        break;
      }
      const users = data.users ?? [];
      authUsersCount += users.length;
      for (const authUser of users) {
        const roleLabel = normalizeRoleLabel(
          authUser.app_metadata?.role ?? authUser.user_metadata?.role
        );
        const fullName =
          asText(authUser.user_metadata?.full_name) ||
          asText(authUser.app_metadata?.full_name) ||
          `${asText(authUser.user_metadata?.first_name)} ${asText(authUser.user_metadata?.last_name)}`.trim();
        const email = asText(authUser.email) || null;
        if (!fullName && !email) continue;
        authRecipients.push({
          id: authUser.id,
          name: fullName || email || `Interne ${authUser.id.slice(0, 8)}`,
          email,
          roleLabel,
          active: true,
        });
      }
      if (users.length < perPage) break;
      page += 1;
    }

    const chauffeurRecipients: MentionableRecipient[] = (chauffeursData ?? [])
      .map((row) => {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        const name = asText(row.nom_complet) || asText(row.nom) || asText(row.courriel) || `Employe #${id}`;
        const email = asText(row.courriel) || null;
        return {
          id: String(id),
          name,
          email,
          roleLabel: "Employe",
          active: row.actif !== false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const accountRequestRecipients: MentionableRecipient[] = (accountRequestsData ?? [])
      .map((row) => {
        const email = asText(row.email) || null;
        const name = asText(row.full_name) || email || null;
        const id = asText(row.invited_user_id) || asText(row.id);
        if (!id || !name) return null;
        return {
          id,
          name,
          email,
          roleLabel: normalizeRoleLabel(row.assigned_role || row.requested_role),
          active: true,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const mergedByKey = new Map<string, MentionableRecipient>();
    const canonicalBySignature = new Map<string, string>();
    const allSources = [...chauffeurRecipients, ...accountRequestRecipients, ...authRecipients];
    for (const recipient of allSources) {
      const emailKey = recipient.email ? recipient.email.toLowerCase() : "";
      const nameKey = normalizeName(recipient.name);
      const keysByPriority = [
        recipient.id ? `id:${recipient.id}` : "",
        emailKey ? `email:${emailKey}` : "",
        nameKey ? `name:${nameKey}` : "",
      ].filter(Boolean);
      const knownCanonical = keysByPriority
        .map((key) => canonicalBySignature.get(key))
        .find((value): value is string => Boolean(value));
      const canonicalKey = knownCanonical ?? keysByPriority[0];
      const previous = mergedByKey.get(canonicalKey);
      if (!previous) {
        mergedByKey.set(canonicalKey, recipient);
        keysByPriority.forEach((key) => canonicalBySignature.set(key, canonicalKey));
        continue;
      }
      mergedByKey.set(canonicalKey, {
        ...previous,
        name: previous.name || recipient.name,
        email: previous.email || recipient.email,
        roleLabel:
          previous.roleLabel && previous.roleLabel !== "Interne"
            ? previous.roleLabel
            : recipient.roleLabel,
        active: previous.active || recipient.active,
      });
      keysByPriority.forEach((key) => canonicalBySignature.set(key, canonicalKey));
    }

    const recipients = [...mergedByKey.values()].sort((a, b) => a.name.localeCompare(b.name, "fr-CA"));

    console.info("[mentionable-employees] chauffeurs count:", chauffeurRecipients.length);
    console.info("[mentionable-employees] account_requests count:", accountRequestRecipients.length);
    console.info("[mentionable-employees] auth_users count:", authUsersCount);
    console.info("[mentionable-employees] merged count:", recipients.length);
    console.info(
      "[mentionable-employees] sample:",
      recipients.slice(0, 5).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        active: item.active,
      }))
    );

    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("[mentionable-employees] crash", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur mentionable-employees." },
      { status: 500 }
    );
  }
}
