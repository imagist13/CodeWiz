/** 浏览器请求 Next /api/* 代理时附带 JWT（token 存在 localStorage）。 */
export function clientAuthHeaders(
  base?: Record<string, string>,
): Record<string, string> {
  const headers = { ...base };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("adorable_token");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}
