import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../../../_lib/upstream-auth";
import { getBackendBaseUrl } from "@/lib/server-upstream-urls";

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ repoId: string; conversationId: string }> },
) {
  const { repoId, conversationId } = await params;
  const headers = await getUpstreamAuthHeaders(req, { contentType: false });

  // Pass Go response through as-is — frontend handles unwrapping
  const response = await fetch(
    `${getBackendBaseUrl()}/api/repos/${repoId}/conversations/${conversationId}`,
    { headers },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: "Failed to fetch conversation",
    }));
    return NextResponse.json(error, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
