import type { PairedConnection, SecureConnectionStorage } from "../security/token-storage.ts";

export interface RestoredConnection {
  token: string;
  connection: PairedConnection;
}

/** Restore only a complete credential record; partial records stay disconnected. */
export async function restoreSavedConnection(
  storage: SecureConnectionStorage,
): Promise<RestoredConnection | null> {
  const [token, connection] = await Promise.all([storage.readToken(), storage.readConnection()]);
  return token && connection ? { token, connection } : null;
}
