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
      ? join(process.env.TEMP ?? "C:\\temp", "codewiz-sandbox")
      : "/tmp/codewiz-sandbox");
  const mapFile = join(base, "port_map.json");
  if (!existsSync(mapFile)) return {};
  try {
    return JSON.parse(readFileSync(mapFile, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * 解析沙盒端口（Docker 模式从 AI service 查询，本地模式从 port_map.json 读取）。
 */
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
      console.warn("[sandbox-terminal] AI sandbox status failed:", e);
    }
  }
  return readSandboxPortMap()[repoId];
}

/**
 * 获取终端上游主机地址。
 * 必须与运行 dev server 的进程一致（ai-service 容器内或本机 localhost）。
 */
function getTerminalUpstreamHost(): string {
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
  ctx: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await ctx.params;

  const port = await resolveSandboxPort(repoId);

  if (!port) {
    console.warn(
      "[sandbox-terminal] no running sandbox for repoId:",
      repoId,
      "— start dev server from chat first",
    );
    return new NextResponse("Sandbox not started yet", { status: 404 });
  }

  const host = getTerminalUpstreamHost();
  const terminalUrl = `http://${host}:${port}`;

  let upstream: Response;
  try {
    upstream = await fetch(terminalUrl, {
      headers: {
        Accept: req.headers.get("accept") || "*/*",
        "Upgrade": req.headers.get("upgrade") || "",
        "Connection": req.headers.get("connection") || "keep-alive",
      },
      redirect: "follow",
      cache: "no-store",
    });
    console.log("[sandbox-terminal] repoId → port", repoId, "→", port, "→", upstream.status);
  } catch (e) {
    console.error("[sandbox-terminal] fetch error:", e);
    return new NextResponse("Terminal server unreachable", { status: 502 });
  }

  const outHeaders = new Headers();
  outHeaders.set("Cache-Control", "no-store");

  const ct = upstream.headers.get("content-type");
  if (ct) outHeaders.set("Content-Type", ct);

  const upgrade = upstream.headers.get("upgrade");
  if (upgrade) outHeaders.set("Upgrade", upgrade);

  for (const [key, value] of upstream.headers.entries()) {
    if (!["content-type", "cache-control", "upgrade", "transfer-encoding", "content-encoding"].includes(key.toLowerCase())) {
      try { outHeaders.set(key, value); } catch { /* skip oversized headers */ }
    }
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}
