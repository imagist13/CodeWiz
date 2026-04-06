import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * 读取 AI service 共享的端口映射文件。
 * 文件路径对应 ai-service sandbox_manager.py 的 SANDBOX_ROOT/PORT_MAP_FILE。
 * Windows 路径兼容。
 */
function readSandboxPortMap(): Record<string, number> {
  // 必须与 ai-service sandbox_manager.py _get_sandbox_root() 完全一致
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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ repoId: string; path?: string[] }> },
) {
  const { repoId, path } = await ctx.params;

  // 从 AI service 的共享端口映射文件读取沙箱端口（无鉴权）
  const portMap = readSandboxPortMap();
  const port = portMap[repoId];

  if (!port) {
    console.warn("[sandbox-preview] no port found for repoId:", repoId, "— AI service may not have started this project yet");
    return new NextResponse("Sandbox not started yet", { status: 404 });
  }

  const host = process.env.PREVIEW_UPSTREAM_FETCH_HOST?.trim()
    || (process.platform === "win32" ? "127.0.0.1" : "localhost");
  const sandboxBaseUrl = `http://${host}:${port}`;

  // 拼装要代理的路径
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

  // 保留内容类型和 3xx 重定向
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

  // 文档 URL 形如 /api/sandbox-preview/<repoId>（无尾斜杠）时，相对路径 style.css 会错误解析到
  // /api/sandbox-preview/style.css。注入 <base> 让静态资源始终挂在当前仓库代理前缀下。
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
