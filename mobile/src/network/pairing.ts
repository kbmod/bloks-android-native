import { ApiClient } from "./api.ts";
import { validateBaseUrl } from "./url.ts";
import { assertTokenShape } from "../security/token-storage.ts";

const PAIR_TOKEN = /^bloks_pair_[A-Za-z0-9_-]{32}$/;
const PAIR_CODE = /^\d{6}$/;

export interface PairingLink {
  baseUrl: string;
  credential: string;
  computerName?: string;
  address: string;
  token?: string;
  code?: string;
}

export interface PairClaim {
  token: string;
  device: { id: string; name: string; pairedAt: number };
}

export class PairingLinkError extends Error {
  override name = "PairingLinkError";
}

function addressBase(address: string): string {
  const value = address.trim();
  if (!value || value.includes("/") || value.includes("#") || value.includes("?")) {
    throw new PairingLinkError("the pairing link has no valid server address");
  }
  // URL handles bracketed IPv6 and hostnames; a bare IPv6 address is
  // bracketed for URL parsing, while host:port remains unchanged.
  const candidate = value.includes("://") ? value : `http://${value.includes(":") && !value.includes("]") && value.split(":").length > 2 ? `[${value}]` : value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new PairingLinkError("the pairing link has no valid server address");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PairingLinkError("the pairing address must use http or https");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new PairingLinkError("the pairing address is malformed");
  }
  return validateBaseUrl(parsed.origin);
}

/** Parse the QR/deep-link format emitted by DevicesSection. */
export function parsePairingLink(value: string): PairingLink {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new PairingLinkError("that is not a Bloks pairing link");
  }
  if (parsed.protocol !== "bloks:" || parsed.hostname !== "pair") {
    throw new PairingLinkError("that is not a Bloks pairing link");
  }
  const address = parsed.searchParams.get("address") ?? "";
  const token = parsed.searchParams.get("token") ?? "";
  const code = parsed.searchParams.get("code") ?? "";
  if (!token && !code) throw new PairingLinkError("the pairing link has no credential");
  if (token && !PAIR_TOKEN.test(token)) throw new PairingLinkError("the pairing token is malformed");
  if (code && !PAIR_CODE.test(code)) throw new PairingLinkError("the pairing code is malformed");
  return {
    address,
    baseUrl: addressBase(address),
    credential: token || code,
    ...(token ? { token } : {}),
    ...(code ? { code } : {}),
    ...(parsed.searchParams.get("name") ? { computerName: parsed.searchParams.get("name")! } : {}),
  };
}

/** Claim a one-time code/token. The returned token must immediately go to a secure adapter. */
export async function claimPairing(
  link: PairingLink,
  deviceName: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<PairClaim> {
  const name = deviceName.trim().replace(/\s+/g, " ").slice(0, 60);
  const api = new ApiClient({ baseUrl: link.baseUrl, fetcher: options.fetcher, timeoutMs: options.timeoutMs });
  const claim = await api.post<PairClaim>("/api/pair/claim", {
    credential: link.credential,
    ...(name ? { device: name } : {}),
  });
  if (!claim || typeof claim.token !== "string" || !claim.device?.id) {
    throw new PairingLinkError("the server returned an invalid pairing response");
  }
  try {
    assertTokenShape(claim.token);
  } catch {
    throw new PairingLinkError("the server returned an invalid device token");
  }
  return claim;
}
