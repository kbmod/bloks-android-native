import React, {createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren} from "react";
import {AppState} from "react-native";
import type { PairedConnection, SecureConnectionStorage } from "../security/token-storage.ts";
import { WorkspaceSessionCoordinator } from "../workspace/session-coordinator.ts";

export interface ConnectionContextValue {
  storage: SecureConnectionStorage;
  connection: PairedConnection | null;
  connect(connection: PairedConnection): void;
  disconnect(): Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);
const WorkspaceSessionContext = createContext<WorkspaceSessionCoordinator | null>(null);

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
  const session = useMemo(
    () => connection ? new WorkspaceSessionCoordinator({baseUrl: connection.baseUrl, storage}) : null,
    [connection, storage],
  );
  useEffect(() => {
    if (!session) return;
    void session.start();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void session.start();
      else if (next === "background" || next === "inactive") session.stop();
    });
    return () => {
      appState.remove();
      session.stop();
    };
  }, [session]);
  return (
    <ConnectionContext.Provider value={value}>
      <WorkspaceSessionContext.Provider value={session}>{children}</WorkspaceSessionContext.Provider>
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider");
  return value;
}

export function useWorkspaceSession(): WorkspaceSessionCoordinator | null {
  return useContext(WorkspaceSessionContext);
}
