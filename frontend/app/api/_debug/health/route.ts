/**
 * Health-check proxy: tests whether Go backend is reachable
 * and what it returns for a project lookup.
 */
import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../../_lib/upstream-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function GET(req: Request) {
  const headers = await getUpstreamAuthHeaders(req, { contentType: false });

  // 1. Test root /health or /api/projects (no auth first)
  let rootOk = false;
  try {
    const r = await fetch(`${API_BASE_URL}/api/projects`, {
      headers: {},
      cache: "no-store",
    });
    rootOk = r.ok;
  } catch (e) {
    rootOk = false;
  }

  // 2. Get the repoId from query params to test authed endpoint
  const url = new URL(req.url);
  const repoId = url.searchParams.get("repoId");
  let projectStatus = 0;
  let projectBody = "";

  if (repoId) {
    try {
      const r = await fetch(`${API_BASE_URL}/api/projects/${repoId}`, {
        headers,
        cache: "no-store",
      });
      projectStatus = r.status;
      projectBody = await r.clone().text();
    } catch (e) {
      projectBody = String(e);
    }
  }

  return NextResponse.json({
    apiBase: API_BASE_URL,
    goReachable: rootOk,
    projectStatus,
    projectBody: projectBody.slice(0, 500),
  });
}
