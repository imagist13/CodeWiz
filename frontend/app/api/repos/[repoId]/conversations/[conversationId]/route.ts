import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../../../_lib/upstream-auth";

const AI_SERVICE_URL =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ repoId: string; conversationId: string }> },
) {
  const { repoId, conversationId } = await params;
  const headers = await getUpstreamAuthHeaders(req, { contentType: false });

  const response = await fetch(
    `${AI_SERVICE_URL}/api/repos/${repoId}/conversations/${conversationId}`,
    { headers },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: "Failed to fetch conversation", code: response.status },
      { status: response.status },
    );
  }

  const data = await response.json();
  return NextResponse.json({ code: 0, message: "success", data });
}
