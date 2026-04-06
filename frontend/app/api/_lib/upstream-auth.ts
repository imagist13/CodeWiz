import { NextRequest } from "next/server";

/**
 * 转发到 Go / AI 时携带 JWT。
 *
 * 读取顺序：
 * 1. 请求 Header 的 Authorization
 * 2. 请求 URL query 的 `?auth_token=`（iframe 无法带 cookie/header）
 *
 * 不依赖 Next.js cookies()，避免服务端读不到前端设置的 httponly/samesite cookie 的问题。
 */
export async function getUpstreamAuthHeaders(
  req: Request | NextRequest,
  opts: { contentType?: string | false } = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (opts.contentType !== false) {
    headers["Content-Type"] = opts.contentType ?? "application/json";
  }

  const incoming = req.headers.get("authorization");
  if (incoming) {
    headers["Authorization"] = incoming;
    return headers;
  }

  // iframe 导航场景：从 URL query 参数取 token
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return headers;
  }
  const tokenParam = url.searchParams.get("auth_token");
  if (tokenParam) {
    headers["Authorization"] = `Bearer ${tokenParam}`;
  }

  return headers;
}

/** 从 localStorage 取 token并注入到 URL query（用于 iframe 场景） */
export function appendAuthParam(url: string): string {
  if (typeof window === "undefined") return url;
  const token = localStorage.getItem("adorable_token");
  if (!token) return url;
  try {
    const u = new URL(url, window.location.href);
    if (!u.searchParams.has("auth_token")) {
      u.searchParams.set("auth_token", token);
    }
    return u.toString();
  } catch {
    return url;
  }
}
