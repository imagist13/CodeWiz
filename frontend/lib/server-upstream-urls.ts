/**
 * Server-side (Route Handler) upstream URLs. Browser code uses NEXT_PUBLIC_* only.
 * In Docker, set BACKEND_INTERNAL_URL / AI_SERVICE_INTERNAL_URL for container DNS.
 */

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

export function getBackendBaseUrl(): string {
  const internal = process.env.BACKEND_INTERNAL_URL?.trim();
  if (internal) return stripTrailingSlash(internal);

  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (typeof pub === "string" && pub.length > 0) {
    return stripTrailingSlash(pub);
  }

  return "http://localhost:8080";
}

export function getAiServiceBaseUrl(): string {
  const internal = process.env.AI_SERVICE_INTERNAL_URL?.trim();
  if (internal) return stripTrailingSlash(internal);

  const pub = process.env.NEXT_PUBLIC_AI_SERVICE_URL;
  if (typeof pub === "string" && pub.length > 0 && pub.startsWith("http")) {
    return stripTrailingSlash(pub);
  }

  return "http://localhost:8000";
}
