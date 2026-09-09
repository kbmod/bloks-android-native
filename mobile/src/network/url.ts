/** URL validation and joining for the native client.
 *
 * The harness is reached by a user-entered LAN address, so callers should
 * validate it before putting it into any request or WebView-like surface.
 * This module intentionally does not make a network request.
 */

export class BaseUrlError extends Error {
  override name = "BaseUrlError";
}

/** Return a canonical origin (or origin plus a harmless path prefix). */
export function validateBaseUrl(input: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new BaseUrlError("a server address is required");
  }
  const raw = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    throw new BaseUrlError("that is not a valid server address");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BaseUrlError("the server address must use http or https");
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new BaseUrlError("the server address must name a host, without credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new BaseUrlError("the server address cannot contain a query or fragment");
  }
  // A path prefix is useful for a reverse proxy, but never allow a path that
  // can escape when API routes are joined.
  const prefix = parsed.pathname.replace(/\/+$/, "");
  if (prefix.includes("..")) throw new BaseUrlError("the server path is not safe");
  return `${parsed.origin}${prefix}`;
}

/** Join a validated base with an API route without double slashes. */
export function apiUrl(baseUrl: string, path: string): string {
  const base = validateBaseUrl(baseUrl);
  if (!path.startsWith("/api/")) {
    throw new BaseUrlError("native requests must target an /api route");
  }
  if (path.includes("..") || path.includes("\\")) {
    throw new BaseUrlError("the API path is not safe");
  }
  return `${base}${path}`;
}
