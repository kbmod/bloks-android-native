import { apiUrl, validateBaseUrl } from "./url.ts";

export interface ApiClientOptions {
  baseUrl: string;
  /** A secure adapter supplies this on demand; the client never persists it. */
  token?: string | null;
  tokenProvider?: () => string | null | Promise<string | null>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export interface JsonRequestInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, statusText = "") {
    const detail =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? String((body as { error: string }).error)
        : statusText || `HTTP ${status}`;
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** A small typed JSON client suitable for React Native's fetch implementation. */
export class ApiClient {
  readonly baseUrl: string;
  private readonly tokenProvider?: ApiClientOptions["tokenProvider"];
  private readonly fixedToken: string | null;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = validateBaseUrl(options.baseUrl);
    this.fixedToken = options.token ?? null;
    this.tokenProvider = options.tokenProvider;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async request<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
    const token = this.tokenProvider ? await this.tokenProvider() : this.fixedToken;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const controller = new AbortController();
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
    try {
      const response = await this.fetcher(apiUrl(this.baseUrl, path), {
        ...init,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 16_384);
        }
      }
      if (!response.ok) throw new ApiError(response.status, body, response.statusText);
      return body as T;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  get<T>(path: string, init: Omit<JsonRequestInit, "method" | "body"> = {}) {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  post<T>(path: string, body?: unknown, init: Omit<JsonRequestInit, "method" | "body"> = {}) {
    return this.request<T>(path, { ...init, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, init: Omit<JsonRequestInit, "method" | "body"> = {}) {
    return this.request<T>(path, { ...init, method: "PATCH", body });
  }

  delete<T>(path: string, init: Omit<JsonRequestInit, "method" | "body"> = {}) {
    return this.request<T>(path, { ...init, method: "DELETE" });
  }
}
