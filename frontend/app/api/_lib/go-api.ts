/** Go 后端统一响应 { code, message, data } */
export function unwrapGoData<T>(payload: unknown): T | undefined {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return undefined;
}

/** Go 后端统一响应 { code, message, data }，返回 data 或 fallback */
export function unwrapGoDataOr<T>(payload: unknown, fallback: T): T {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return fallback;
}
