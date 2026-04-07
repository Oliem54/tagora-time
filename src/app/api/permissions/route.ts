import { NextResponse } from "next/server";
import { createPublicServerSupabaseClient } from "@/app/lib/supabase/server";
import { APP_PERMISSION_DEFINITIONS } from "@/app/lib/auth/permissions";

export async function GET() {
  try {
    const supabase = createPublicServerSupabaseClient();
    const { data, error } = await supabase
      .from("app_permissions")
      .select("slug, label, module_key, description, sort_order")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ permissions: APP_PERMISSION_DEFINITIONS });
    }

    return NextResponse.json({
      permissions: (data ?? []).map((item) => ({
        value: item.slug,
        label: item.label,
        module: item.module_key,
        description: item.description,
        sortOrder: item.sort_order,
      })),
    });
  } catch {
    return NextResponse.json({ permissions: APP_PERMISSION_DEFINITIONS });
  }
}
