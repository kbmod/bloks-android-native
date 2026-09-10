import React, {createContext, useContext, useMemo, useState, type PropsWithChildren} from "react";
import type { PairedConnection, SecureConnectionStorage } from "../security/token-storage.ts";

export interface ConnectionContextValue {
  storage: SecureConnectionStorage;
  connection: PairedConnection | null;
  connect(connection: PairedConnection): void;
  disconnect(): Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({
  storage,
  initialConnection,
  children,
}: PropsWithChildren<{ storage: SecureConnectionStorage; initialConnection: PairedConnection | null }>) {
  const [connection, setConnection] = useState<PairedConnection | null>(initialConnection);
  const value = useMemo<ConnectionContextValue>(() => ({
    storage,
    connection,
    connect: (next) => setConnection(next),
    disconnect: async () => {
      // This is deliberately local-only. Server-side device revocation is a
      // separate, explicit action and is never implied by this button.
      await storage.clearConnection();
      setConnection(null);
    },
  }), [connection, storage]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider");
  return value;
}
