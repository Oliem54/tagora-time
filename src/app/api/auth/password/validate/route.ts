import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestUser } from "@/app/lib/account-requests.server";
import { validatePasswordChangeInput } from "@/app/lib/auth/passwords";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      confirmPassword?: unknown;
      requireCurrentPassword?: unknown;
    };

    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const requireCurrentPassword = body.requireCurrentPassword !== false;

    const validationError = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmPassword,
      requireCurrentPassword,
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (requireCurrentPassword) {
      const { user } = await getAuthenticatedRequestUser(req);

      if (!user?.email) {
        return NextResponse.json({ error: "Session invalide." }, { status: 401 });
      }

      const publicSupabase = createPublicServerSupabaseClient();
      const { error } = await publicSupabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (error) {
        return NextResponse.json(
          { error: "Mot de passe actuel incorrect." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Validation impossible pour le moment.",
      },
      { status: 500 }
    );
  }
}
