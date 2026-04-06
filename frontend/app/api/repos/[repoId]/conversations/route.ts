import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../../_lib/upstream-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type GoConversation = { id: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;
  const headers = await getUpstreamAuthHeaders(req, { contentType: false });

  const response = await fetch(
    `${API_BASE_URL}/api/repos/${repoId}/conversations`,
    { headers },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: "Failed to fetch conversations", code: response.status },
      { status: response.status },
    );
  }

  const payload = await response.json();
  // Go backend returns {code, message, data}, data may be the array or wrapped
  const data = payload.data ?? payload;
  return NextResponse.json({ code: 0, message: "success", data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;
  const headers = await getUpstreamAuthHeaders(req);
  const body = await req.text();

  const response = await fetch(
    `${API_BASE_URL}/api/repos/${repoId}/conversations`,
    { method: "POST", headers, body },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: "Failed to create conversation",
    }));
    return NextResponse.json(error, { status: response.status });
  }

  const payload = await response.json();
  const conv = payload.data ?? payload;

  return NextResponse.json({
    code: 0,
    message: "created",
    data: conv,
    conversationId: (conv as GoConversation)?.id,
    id: (conv as GoConversation)?.id,
  });
}
