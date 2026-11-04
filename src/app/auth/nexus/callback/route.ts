import { NextResponse } from "next/server";
import { handleNexusCallback } from "@/app/lib/auth/nexus-callback-route.server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleNexusCallback(request);
}

export async function POST(request: Request): Promise<NextResponse | Response> {
  return handleNexusCallback(request);
}
