import { NextResponse } from "next/server";
import { getUpstreamAuthHeaders } from "../_lib/upstream-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type GoProject = { id: string; name?: string };
type GoConversation = { id: string };

export async function GET(req: Request) {
  const headers = await getUpstreamAuthHeaders(req, { contentType: false });
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: "Failed to fetch projects", code: response.status },
      { status: response.status },
    );
  }

  const payload = await response.json();
  // Handle both wrapped {code, message, data} and unwrapped array responses
  const projects = payload.data ?? (Array.isArray(payload) ? payload : []);

  const repositories = (Array.isArray(projects) ? projects : []).map((p: Record<string, unknown>) => {
    const previewUrl = p.preview_url as string | undefined;
    const vm = previewUrl
      ? {
          vmId: (p.vm_id as string) ?? (p.id as string),
          previewUrl,
          devCommandTerminalUrl: (p.dev_command_terminal_url as string) ?? previewUrl,
          additionalTerminalsUrl: (p.additional_terminals_url as string) ?? previewUrl,
        }
      : null;

    return {
      id: p.id,
      name: p.name ?? "Untitled Repo",
      description: p.description,
      git_url: p.git_url,
      source_repo_id: p.source_repo_id,
      vm_id: p.vm_id,
      metadata: {
        vm,
        deployments: [],
        productionDomain: (p.production_domain as string | undefined) ?? null,
        productionDeploymentId: (p.production_deployment_id as string | undefined) ?? null,
      },
    };
  });

  return NextResponse.json({
    repositories,
  });
}

export async function POST(req: Request) {
  const authHeaders = await getUpstreamAuthHeaders(req);

  let rawBody: Record<string, unknown> = {};
  try {
    const text = await req.text();
    rawBody = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    rawBody = {};
  }

  const githubRepoName =
    typeof rawBody.githubRepoName === "string"
      ? rawBody.githubRepoName.trim()
      : "";
  const conversationTitle =
    typeof rawBody.conversationTitle === "string"
      ? rawBody.conversationTitle.trim()
      : "";
  const nameFromClient =
    typeof rawBody.name === "string" ? rawBody.name.trim() : "";
  const name =
    nameFromClient ||
    githubRepoName ||
    conversationTitle ||
    "Untitled project";
  const description =
    typeof rawBody.description === "string" ? rawBody.description : "";

  const projectRes = await fetch(`${API_BASE_URL}/api/projects`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name, description }),
    credentials: "include",
  });

  if (!projectRes.ok) {
    const error = await projectRes.json().catch(() => ({
      message: "Failed to create project",
    }));
    return NextResponse.json(error, { status: projectRes.status });
  }

  const projectPayload = await projectRes.json();
  const project = projectPayload.data ?? projectPayload;
  const projectId = (project as GoProject)?.id;
  if (!projectId) {
    return NextResponse.json(
      { message: "Invalid project response from backend" },
      { status: 502 },
    );
  }

  const convTitle = conversationTitle || name;
  const convRes = await fetch(
    `${API_BASE_URL}/api/repos/${projectId}/conversations`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ title: convTitle }),
      credentials: "include",
    },
  );

  if (!convRes.ok) {
    const error = await convRes.json().catch(() => ({
      message: "Failed to create conversation",
    }));
    return NextResponse.json(error, { status: convRes.status });
  }

  const convPayload = await convRes.json();
  const conv = convPayload.data ?? convPayload;
  const conversationId = (conv as GoConversation)?.id;

  return NextResponse.json({
    id: projectId,
    name: (project as GoProject).name ?? name,
    conversationId,
    metadata: {
      vm: null,
      conversations: [],
      deployments: [],
      productionDomain: null,
      productionDeploymentId: null,
    },
  });
}
