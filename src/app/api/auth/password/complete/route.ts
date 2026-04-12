import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { buildCompletedPasswordMetadata } from "@/app/lib/auth/passwords";
import { createAdminSupabaseClient } from "@/app/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthenticatedRequestUser(req);

    if (!user?.id) {
      return NextResponse.json({ error: "Session invalide." }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.auth.admin.getUserById(user.id);

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Utilisateur introuvable." },
        { status: 404 }
      );
    }

    const adminUser = data.user;
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      {
        app_metadata: buildCompletedPasswordMetadata(adminUser.app_metadata),
        user_metadata: buildCompletedPasswordMetadata(adminUser.user_metadata),
      }
    );

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Synchronisation impossible pour le moment.",
      },
      { status: 500 }
    );
  }
}
