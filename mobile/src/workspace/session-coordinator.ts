import { ApiClient, type ApiClientOptions } from "../network/api.ts";
import { hydrateWorkspace, type MobileHydratedWorkspace } from "../network/hydration.ts";
import { LiveEventTransport, type LiveEventTransportOptions, type LiveEventTransportStatus } from "../network/live-event-transport.ts";
import { apiUrl } from "../network/url.ts";
import { MobileStateController } from "../state/controller.ts";
import type { SecureConnectionStorage } from "../security/token-storage.ts";

export type WorkspaceSessionStatus =
  | "idle"
  | "hydrating"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unreachable"
  | "unauthorized"
  | "stopped";

export interface WorkspaceSessionSnapshot {
  status: WorkspaceSessionStatus;
  state: MobileStateController["state"];
}

interface EventTransport {
  start(): void;
  stop(): void;
}

export interface WorkspaceSessionOptions {
  baseUrl: string;
  storage: SecureConnectionStorage;
  fetcher?: ApiClientOptions["fetcher"];
  timeoutMs?: number;
  hydrate?: (client: { get<T>(path: string): Promise<T> }) => Promise<MobileHydratedWorkspace>;
  transportFactory?: (options: LiveEventTransportOptions) => EventTransport;
}

type Listener = () => void;

function statusForError(error: unknown): WorkspaceSessionStatus {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  return status === 401 || status === 403 ? "unauthorized" : "unreachable";
}

/** Owns the connected workspace lifecycle without React or native UI dependencies. */
export class WorkspaceSessionCoordinator {
  readonly controller: MobileStateController;
  private readonly client: ApiClient;
  private readonly storage: SecureConnectionStorage;
  private readonly hydrateFn: NonNullable<WorkspaceSessionOptions["hydrate"]>;
  private readonly transportFactory: NonNullable<WorkspaceSessionOptions["transportFactory"]>;
  private readonly listeners = new Set<Listener>();
  private status: WorkspaceSessionStatus = "idle";
  private snapshotValue: WorkspaceSessionSnapshot;
  private transport: EventTransport | null = null;
  private hydrationInFlight: Promise<void> | null = null;
  private hydrationGeneration: number | null = null;
  private active = false;
  private generation = 0;
  private streamConnected = false;

  constructor(options: WorkspaceSessionOptions) {
    this.storage = options.storage;
    this.client = new ApiClient({
      baseUrl: options.baseUrl,
      tokenProvider: () => this.storage.readToken(),
      fetcher: options.fetcher,
      timeoutMs: options.timeoutMs,
    });
    this.hydrateFn = options.hydrate ?? hydrateWorkspace;
    this.transportFactory = options.transportFactory ?? ((transportOptions) => new LiveEventTransport(transportOptions));
    this.controller = new MobileStateController({
      onRehydrateRequested: () => this.requestRehydrate(),
    });
    this.snapshotValue = {status: this.status, state: this.controller.state};
  }

  get snapshot(): WorkspaceSessionSnapshot {
    return this.snapshotValue;
  }

  /** Authenticated client shared by roster and conversation commands. */
  get apiClient(): ApiClient {
    return this.client;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const generation = ++this.generation;
    this.streamConnected = false;
    this.setStatus("hydrating");
    try {
      await this.rehydrate(generation);
    } catch (error) {
      if (this.active && generation === this.generation) {
        this.handleHydrationFailure(error);
      }
      return;
    }
    if (!this.active || generation !== this.generation) return;
    this.transport = this.transportFactory({
      token: () => this.storage.readToken(),
      path: () => apiUrl(this.client.baseUrl, this.controller.nextEventsPath()),
      onData: (data) => this.onData(data),
      onStatus: (status) => this.onTransportStatus(status),
    });
    this.setStatus("connecting");
    this.transport.start();
  }

  stop(): void {
    if (!this.active && !this.transport) {
      this.controller.dispatch({type: "connected", value: false});
      this.setStatus("stopped");
      return;
    }
    this.active = false;
    this.generation += 1;
    this.hydrationInFlight = null;
    this.hydrationGeneration = null;
    this.streamConnected = false;
    const transport = this.transport;
    this.transport = null;
    transport?.stop();
    this.controller.dispatch({type: "connected", value: false});
    this.setStatus("stopped");
  }

  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  private async rehydrate(generation = this.generation): Promise<void> {
    if (this.hydrationInFlight && this.hydrationGeneration === generation) return this.hydrationInFlight;
    const operation = (async () => {
      try {
        const workspace = await this.hydrateFn(this.client);
        if (this.active && generation === this.generation) {
          this.controller.hydrate(workspace);
          this.controller.dispatch({type: "connected", value: this.streamConnected});
          if (this.streamConnected) this.setStatus("connected");
          else this.refreshSnapshot();
        }
      } catch (error) {
        throw error;
      }
    })();
    const tracked = operation.finally(() => {
      if (this.hydrationInFlight === tracked) {
        this.hydrationInFlight = null;
        this.hydrationGeneration = null;
      }
    });
    this.hydrationInFlight = tracked;
    this.hydrationGeneration = generation;
    return tracked;
  }

  private onData(data: string): void {
    if (!this.active) return;
    this.controller.fold(data);
    this.refreshSnapshot();
  }

  private requestRehydrate(): void {
    if (!this.active) return;
    // The hello/replay-gap callback is asynchronous. Capture the lifecycle
    // generation at the point the gap was observed so a late rejection from
    // this hydration cannot tear down a newer stop/start session.
    const generation = this.generation;
    this.setStatus("hydrating");
    void this.rehydrate(generation).catch((error) => this.handleHydrationFailure(error, generation));
  }

  private handleHydrationFailure(error: unknown, generation = this.generation): void {
    if (!this.active || generation !== this.generation) return;
    this.active = false;
    this.generation += 1;
    this.streamConnected = false;
    const transport = this.transport;
    this.transport = null;
    transport?.stop();
    this.controller.dispatch({type: "connected", value: false});
    this.setStatus(statusForError(error));
  }

  private onTransportStatus(status: LiveEventTransportStatus): void {
    if (!this.active && status.kind !== "stopped") return;
    switch (status.kind) {
      case "connecting":
        this.setStatus("connecting");
        break;
      case "connected":
        this.streamConnected = true;
        this.controller.dispatch({type: "connected", value: true});
        this.setStatus("connected");
        break;
      case "unreachable":
        this.streamConnected = false;
        this.controller.dispatch({type: "connected", value: false});
        this.setStatus("unreachable");
        break;
      case "reconnecting":
        this.setStatus("reconnecting");
        break;
      case "unauthorized":
        this.active = false;
        this.streamConnected = false;
        this.controller.dispatch({type: "connected", value: false});
        this.setStatus("unauthorized");
        break;
      case "stopped":
        if (this.active) this.setStatus("stopped");
        break;
    }
  }

  private setStatus(status: WorkspaceSessionStatus): void {
    this.status = status;
    this.refreshSnapshot();
  }

  private refreshSnapshot(): void {
    this.snapshotValue = {status: this.status, state: this.controller.state};
    for (const listener of this.listeners) listener();
  }
}
