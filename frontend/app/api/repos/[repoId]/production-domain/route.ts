import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../../_lib/upstream-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;
  const headers = await getUpstreamAuthHeaders(req);
  const body = await req.text();

  const response = await fetch(
    `${API_BASE_URL}/api/repos/${repoId}/production-domain`,
    { method: "POST", headers, body },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: "Failed to set production domain",
    }));
    return NextResponse.json(error, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json({ code: 0, message: "success", data });
}
