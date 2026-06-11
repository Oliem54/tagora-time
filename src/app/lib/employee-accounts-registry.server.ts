import "server-only";

import type { User } from "@supabase/supabase-js";
import { normalizeEmail, type AccountRequestRow } from "@/app/lib/account-requests.shared";
import { getUserRole } from "@/app/lib/auth/roles";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";
import {
  buildRegistryEntryFromParts,
  type ChauffeurRegistryRow,
  type EmployeeAccountsRegistryEntry,
} from "@/app/lib/employee-accounts-registry.shared";

type ChauffeurProfileRow = ChauffeurRegistryRow & {
  schedule_active?: boolean | null;
};

async function listAllAuthUsers() {
  const supabase = createAdminSupabaseClient();
  const users: User[] = [];
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

function isPortalAuthCandidate(user: User) {
  return Boolean(
    getUserRole(user) ||
      user.app_metadata?.access_disabled === true ||
      user.user_metadata?.access_disabled === true ||
      user.app_metadata?.chauffeur_id ||
      user.user_metadata?.chauffeur_id ||
      user.invited_at
  );
}

function resolveMatchedProfile(options: {
  request: AccountRequestRow;
  existingAccount: User | undefined;
  profileById: Map<string, ChauffeurProfileRow>;
  profileByAuthUserId: Map<string, ChauffeurProfileRow>;
  profileByEmail: Map<string, ChauffeurProfileRow>;
}) {
  const existingChauffeurId = Number(
    options.existingAccount?.app_metadata?.chauffeur_id ??
      options.existingAccount?.user_metadata?.chauffeur_id ??
      NaN
  );
  const profileByExplicitId = Number.isFinite(existingChauffeurId)
    ? options.profileById.get(String(existingChauffeurId)) ?? null
    : null;
  const profileByLinkedAuthUser = options.existingAccount?.id
    ? options.profileByAuthUserId.get(options.existingAccount.id) ?? null
    : null;
  const profileByMatchingEmail =
    options.profileByEmail.get(normalizeEmail(options.request.email)) ?? null;

  return profileByExplicitId ?? profileByLinkedAuthUser ?? profileByMatchingEmail;
}

export async function loadEmployeeAccountsRegistry(): Promise<EmployeeAccountsRegistryEntry[]> {
  const supabase = createAdminSupabaseClient();

  const [{ data: requests, error: requestsError }, { data: chauffeurProfiles, error: chauffeursError }] =
    await Promise.all([
      supabase.from("account_requests").select("*").order("created_at", { ascending: false }),
      supabase
        .from("chauffeurs")
        .select("id, nom, courriel, telephone, actif, auth_user_id, schedule_active")
        .order("id", { ascending: true }),
    ]);

  if (requestsError) {
    throw requestsError;
  }
  if (chauffeursError) {
    throw chauffeursError;
  }

  const authUsers = await listAllAuthUsers();
  const profiles = (chauffeurProfiles ?? []) as ChauffeurProfileRow[];

  const userByEmail = new Map(
    authUsers
      .filter((user) => Boolean(user.email))
      .map((user) => [normalizeEmail(String(user.email)), user] as const)
  );
  const userById = new Map(authUsers.map((user) => [user.id, user] as const));
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile] as const));
  const profileByAuthUserId = new Map(
    profiles
      .filter((profile) => Boolean(profile.auth_user_id))
      .map((profile) => [String(profile.auth_user_id), profile] as const)
  );
  const profileByEmail = new Map(
    profiles
      .filter((profile) => Boolean(profile.courriel))
      .map((profile) => [normalizeEmail(profile.courriel), profile] as const)
  );

  const entries: EmployeeAccountsRegistryEntry[] = [];
  const coveredChauffeurIds = new Set<number>();
  const coveredAuthUserIds = new Set<string>();

  for (const request of (requests ?? []) as AccountRequestRow[]) {
    const existingAccount = userByEmail.get(normalizeEmail(request.email));
    const matchedProfile = resolveMatchedProfile({
      request,
      existingAccount,
      profileById,
      profileByAuthUserId,
      profileByEmail,
    });

    if (matchedProfile?.id) {
      coveredChauffeurIds.add(matchedProfile.id);
    }
    if (existingAccount?.id) {
      coveredAuthUserIds.add(existingAccount.id);
    }
    if (request.invited_user_id) {
      coveredAuthUserIds.add(request.invited_user_id);
    }

    const authUser =
      existingAccount ??
      (request.invited_user_id ? userById.get(request.invited_user_id) ?? null : null);

    const authUserFoundForProfile = Boolean(
      matchedProfile?.auth_user_id &&
        userById.has(matchedProfile.auth_user_id) &&
        (!authUser || authUser.id === matchedProfile.auth_user_id)
    );

    entries.push(
      buildRegistryEntryFromParts({
        registryKey: `request:${request.id}`,
        displayName: request.full_name,
        email: normalizeEmail(request.email),
        chauffeur: matchedProfile,
        authUser: authUser ?? null,
        accountRequest: request,
        authUserFoundForProfile,
      })
    );
  }

  for (const profile of profiles) {
    if (coveredChauffeurIds.has(profile.id)) {
      continue;
    }

    const authUser = profile.auth_user_id ? userById.get(profile.auth_user_id) ?? null : null;
    const email =
      normalizeEmail(profile.courriel) ||
      (authUser?.email ? normalizeEmail(authUser.email) : null);

    if (authUser?.id) {
      coveredAuthUserIds.add(authUser.id);
    }
    coveredChauffeurIds.add(profile.id);

    entries.push(
      buildRegistryEntryFromParts({
        registryKey: `employee:${profile.id}`,
        displayName: profile.nom?.trim() || `Employé #${profile.id}`,
        email,
        chauffeur: profile,
        authUser,
        accountRequest: null,
        authUserFoundForProfile: Boolean(
          profile.auth_user_id && authUser && authUser.id === profile.auth_user_id
        ),
      })
    );
  }

  for (const authUser of authUsers) {
    if (!isPortalAuthCandidate(authUser)) {
      continue;
    }

    if (coveredAuthUserIds.has(authUser.id)) {
      continue;
    }

    const metadataChauffeurId = Number(
      authUser.app_metadata?.chauffeur_id ?? authUser.user_metadata?.chauffeur_id ?? NaN
    );
    const profileFromMetadata = Number.isFinite(metadataChauffeurId)
      ? profileById.get(String(metadataChauffeurId)) ?? null
      : null;
    const profileFromAuthLink = profileByAuthUserId.get(authUser.id) ?? null;
    const profileFromEmail = authUser.email
      ? profileByEmail.get(normalizeEmail(authUser.email)) ?? null
      : null;
    const matchedProfile =
      profileFromAuthLink ?? profileFromMetadata ?? profileFromEmail ?? null;

    if (matchedProfile?.id) {
      coveredChauffeurIds.add(matchedProfile.id);
    }
    coveredAuthUserIds.add(authUser.id);

    entries.push(
      buildRegistryEntryFromParts({
        registryKey: `auth:${authUser.id}`,
        displayName:
          authUser.user_metadata?.full_name?.toString().trim() ||
          authUser.email ||
          `Auth ${authUser.id.slice(0, 8)}`,
        email: authUser.email ? normalizeEmail(authUser.email) : null,
        chauffeur: matchedProfile,
        authUser,
        accountRequest: null,
        authUserFoundForProfile: Boolean(
          matchedProfile?.auth_user_id &&
            matchedProfile.auth_user_id === authUser.id &&
            userById.has(matchedProfile.auth_user_id)
        ),
      })
    );
  }

  return entries.sort((left, right) =>
    (left.displayName || "").localeCompare(right.displayName || "", "fr-CA")
  );
}
