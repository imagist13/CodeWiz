import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../_lib/upstream-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repoId = searchParams.get("repoId");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 12;

  if (!repoId) {
    return NextResponse.json(
      { ok: false, error: "Missing repoId." },
      { status: 400 },
    );
  }

  const headers = await getUpstreamAuthHeaders(req, { contentType: false });

  const response = await fetch(
    `${API_BASE_URL}/api/projects/${repoId}/deploy/timeline?limit=${limit}`,
    { headers },
  );

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: "Failed to fetch deployment timeline." },
      { status: response.status },
    );
  }

  const data = await response.json();
  return NextResponse.json({ ok: true, timeline: data });
}
