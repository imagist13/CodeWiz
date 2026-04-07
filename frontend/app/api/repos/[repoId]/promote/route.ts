import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../../_lib/upstream-auth";

import { getBackendBaseUrl } from "@/lib/server-upstream-urls";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await params;
  const headers = await getUpstreamAuthHeaders(req);
  const body = await req.text();

  const response = await fetch(
    `${getBackendBaseUrl()}/api/repos/${repoId}/promote`,
    { method: "POST", headers, body },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: "Failed to promote deployment",
    }));
    return NextResponse.json(error, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json({ code: 0, message: "success", data });
}
