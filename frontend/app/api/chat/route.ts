import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAiServiceBaseUrl } from "@/lib/server-upstream-urls";

async function resolveAuthorization(req: Request): Promise<string | null> {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader) {
    return fromHeader;
  }
  const jar = await cookies();
  const token = jar.get("adorable_token")?.value;
  if (token) {
    return `Bearer ${token}`;
  }
  return null;
}

export async function POST(req: Request) {
  const authHeader = await resolveAuthorization(req);

  if (!authHeader) {
    return NextResponse.json(
      { error: "Authorization header required" },
      { status: 401 },
    );
  }

  const response = await fetch(`${getAiServiceBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(await req.json()),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: "AI service error",
    }));
    return NextResponse.json(error, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
