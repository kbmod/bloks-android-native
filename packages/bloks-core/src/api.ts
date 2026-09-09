import type {
  ApiErrorBody,
  Blok,
  Bot,
  InstanceInfo,
  PairingClaim,
  PairingStart,
  PairingStatus,
  ProviderRow,
} from "./contracts.ts";

export interface ApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

export type ApiTransport = (path: string, request?: ApiRequest) => Promise<unknown>;

export async function requestJson<T>(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  baseUrl: string,
  path: string,
  request: ApiRequest = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetcher(new URL(path, baseUrl), {
    method: request.method ?? "GET",
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

export const apiPaths = {
  bots: "/api/bots?messages=50",
  bloks: "/api/bloks",
  instances: "/api/instances",
  providers: "/api/providers",
  config: "/api/config",
  events: "/api/events",
} as const;

export interface HydratedWorkspace {
  bots: Bot[];
  bloks: Blok[];
  instances: InstanceInfo[];
  providers: ProviderRow[];
  config: unknown;
}

export interface PairingApi {
  status(): Promise<PairingStatus>;
  start(): Promise<PairingStart>;
  claim(credential: string, device: string): Promise<PairingClaim>;
}
