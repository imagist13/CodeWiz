import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAiServiceBaseUrl } from "@/lib/server-upstream-urls";

/**
 * 读取 AI service 共享的端口映射文件（仅本地开发：前后端同机、无 Docker 网络时使用）。
 * 文件路径对应 ai-service sandbox_manager.py 的 SANDBOX_ROOT/port_map.json。
 */
function readSandboxPortMap(): Record<string, number> {
  const base =
    process.env.SANDBOX_ROOT ??
    (process.platform === "win32"
      ? join(process.env.TEMP ?? "C:\\temp", "adorable-sandbox")
      : "/tmp/adorable-sandbox");
  const mapFile = join(base, "port_map.json");
  if (!existsSync(mapFile)) return {};
  try {
    return JSON.parse(readFileSync(mapFile, "utf-8"));
  } catch {
    return {};
  }
}

/** Docker / 多容器：向 AI 服务查端口；预览 HTTP 进程在 ai-service 容器内监听 0.0.0.0:port */
async function resolveSandboxPort(repoId: string): Promise<number | undefined> {
  const aiBase = getAiServiceBaseUrl();
  if (aiBase.startsWith("http")) {
    try {
      const url = `${aiBase}/api/sandbox/status/${encodeURIComponent(repoId)}`;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          exists?: boolean;
          is_running?: boolean;
          port?: number;
        };
        if (j.exists && j.is_running && typeof j.port === "number") {
          return j.port;
        }
      }
    } catch (e) {
      console.warn("[sandbox-preview] AI sandbox status failed:", e);
    }
  }
  return readSandboxPortMap()[repoId];
}

/**
 * 预览上游主机：必须与运行 python http.server 的容器一致。
 * - Docker：AI_SERVICE_INTERNAL_URL=http://ai-service:8000 → 用主机名 ai-service
 * - 本机：localhost
 */
function getPreviewUpstreamHost(): string {
  const override = process.env.PREVIEW_UPSTREAM_FETCH_HOST?.trim();
  if (override) return override;
  const internal = process.env.AI_SERVICE_INTERNAL_URL?.trim();
  if (internal) {
    try {
      return new URL(internal).hostname;
    } catch {
      /* ignore */
    }
  }
  return process.platform === "win32" ? "127.0.0.1" : "localhost";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ repoId: string; path?: string[] }> },
) {
  const { repoId, path } = await ctx.params;

  const port = await resolveSandboxPort(repoId);

  if (!port) {
    console.warn(
      "[sandbox-preview] no running sandbox for repoId:",
      repoId,
      "— start preview from chat (startDevServerTool) or check AI service",
    );
    return new NextResponse("Sandbox not started yet", { status: 404 });
  }

  const host = getPreviewUpstreamHost();
  const sandboxBaseUrl = `http://${host}:${port}`;

  const extra = path?.join("/") ?? "";
  const incoming = new URL(req.url);
  let targetUrl: URL;
  try {
    targetUrl = extra
      ? new URL(`/${extra}`, sandboxBaseUrl + "/")
      : new URL(sandboxBaseUrl);
  } catch {
    return new NextResponse("Invalid path", { status: 400 });
  }
  targetUrl.search = incoming.search;

  console.log("[sandbox-preview] repoId → port", repoId, "→", port, "→ fetch", targetUrl.toString());

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers: {
        Accept: req.headers.get("accept") || "*/*",
      },
      redirect: "manual",
      cache: "no-store",
    });
    console.log("[sandbox-preview] sandbox →", upstream.status);
  } catch (e) {
    console.error("[sandbox-preview] fetch error:", e);
    return new NextResponse("Preview server unreachable", { status: 502 });
  }

  const outHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) outHeaders.set("Content-Type", ct);
  outHeaders.set("Cache-Control", "no-store");

  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get("location");
    if (loc) outHeaders.set("Location", loc);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  const isHtml = (ct || "").toLowerCase().includes("text/html");
  if (isHtml && upstream.ok) {
    const raw = await upstream.text();
    if (/<base\s/i.test(raw)) {
      return new NextResponse(raw, {
        status: upstream.status,
        headers: outHeaders,
      });
    }
    const baseHref = `/api/sandbox-preview/${repoId}/`;
    let body = raw;
    if (/<head[^>]*>/i.test(body)) {
      body = body.replace(
        /<head[^>]*>/i,
        (open) => `${open}<base href="${baseHref}">`,
      );
    } else if (/<html[^>]*>/i.test(body)) {
      body = body.replace(
        /<html[^>]*>/i,
        (open) => `${open}<head><base href="${baseHref}"></head>`,
      );
    } else {
      body = `<base href="${baseHref}">${body}`;
    }
    return new NextResponse(body, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}
