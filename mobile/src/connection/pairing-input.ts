import type { PairingLink } from "../network/pairing.ts";
import { BaseUrlError, validateBaseUrl } from "../network/url.ts";

const PAIR_TOKEN = /^bloks_pair_[A-Za-z0-9_-]{32}$/;
const PAIR_CODE = /^\d{6}$/;

export class PairingInputError extends Error {
  override name = "PairingInputError";
}

/** Build the same validated claim object used by a bloks://pair link. */
export function parseManualPairing(address: string, credential: string): PairingLink {
  const baseUrl = validateBaseUrl(address);
  const offered = credential.trim();
  if (PAIR_CODE.test(offered)) {
    return { address: address.trim(), baseUrl, credential: offered, code: offered };
  }
  if (PAIR_TOKEN.test(offered)) {
    return { address: address.trim(), baseUrl, credential: offered, token: offered };
  }
  throw new PairingInputError("enter a six-digit pairing code or a valid one-time token");
}

export type PairingFailure = "expired" | "unauthorized" | "unreachable" | "invalid";

/** Convert transport/API failures into bounded text categories for the UI. */
export function classifyPairingFailure(error: unknown): PairingFailure {
  if (error instanceof PairingInputError || error instanceof BaseUrlError) return "invalid";
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 401 || status === 410) return "expired";
  if (status === 403) return "unauthorized";
  if (error instanceof TypeError || (error instanceof Error && error.name === "AbortError")) return "unreachable";
  return "unreachable";
}

export function pairingFailureMessage(failure: PairingFailure): string {
  switch (failure) {
    case "expired": return "That pairing code or token has expired. Start a new pairing window on Bloks.";
    case "unauthorized": return "Bloks did not authorize this pairing request. Check the address and try again.";
    case "unreachable": return "Bloks could not be reached. Check that both devices are on the same network.";
    case "invalid": return "Check the server address and enter a six-digit code or one-time token.";
  }
}
