/**
 * Storage boundary for the paired bearer token.
 *
 * Android's implementation belongs in the native layer and should use the
 * Android Keystore (for example through a maintained secure-storage module).
 * There is intentionally no plaintext or in-memory persistence implementation
 * here: a caller must provide an adapter before a token can be restored.
 */
export interface SecureTokenStorage {
  readToken(): Promise<string | null>;
  writeToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export interface PairedConnection {
  /** Non-secret harness origin, persisted separately if desired. */
  baseUrl: string;
  deviceId?: string;
}

export interface SecureConnectionStorage extends SecureTokenStorage {
  readConnection(): Promise<PairedConnection | null>;
  writeConnection(connection: PairedConnection): Promise<void>;
  /** Persist the bearer token and non-secret connection metadata in one record. */
  writePairedConnection(token: string, connection: PairedConnection): Promise<void>;
  clearConnection(): Promise<void>;
}

export function assertTokenShape(token: unknown): asserts token is string {
  if (typeof token !== "string" || token.length < 32 || token.length > 512 || /[\u0000-\u001f\u007f\s]/.test(token)) {
    throw new Error("the server returned an invalid device token");
  }
}
