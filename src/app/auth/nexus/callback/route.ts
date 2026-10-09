import {
  handleNexusCallback,
  handleNexusCallbackPost,
} from "@/app/lib/auth/nexus-callback-handler.server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleNexusCallback(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleNexusCallbackPost(request);
}
