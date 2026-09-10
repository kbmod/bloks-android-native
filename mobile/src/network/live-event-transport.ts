import { ReconnectBackoff, SseParser } from "./sse.ts";

export interface IncrementalXhr {
  readonly responseText: string;
  readonly status: number;
  readonly readyState: number;
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  open(method: string, url: string, asynchronous: boolean): void;
  setRequestHeader(name: string, value: string): void;
  send(): void;
  abort(): void;
}

export type XhrFactory = () => IncrementalXhr;

export interface TransportTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type LiveEventTransportStatus =
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "reconnecting"; delayMs: number; reason: "unreachable"; status?: number }
  | { kind: "unreachable"; status?: number }
  | { kind: "unauthorized"; status: number }
  | { kind: "stopped" };

export interface LiveEventTransportOptions {
  /** A fresh token is requested for every reconnect. */
  token: string | null | (() => string | null | Promise<string | null>);
  /** Resolved for every connection, so callers can include the latest cursor. */
  path: string | (() => string);
  onData: (data: string) => void;
  onStatus?: (status: LiveEventTransportStatus) => void;
  xhrFactory?: XhrFactory;
  timers?: TransportTimers;
  random?: () => number;
  minReconnectMs?: number;
  maxReconnectMs?: number;
  backoffFactor?: number;
}

const defaultXhrFactory: XhrFactory = () => new XMLHttpRequest() as unknown as IncrementalXhr;
const defaultTimers: TransportTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * A small SSE lifecycle wrapper for React Native's incremental XHR support.
 * It owns no cursor: callers resolve `path` on each reconnect, normally by
 * asking EventStreamCursor for its current `since` URL.
 */
export class LiveEventTransport {
  private readonly options: LiveEventTransportOptions;
  private readonly xhrFactory: XhrFactory;
  private readonly timers: TransportTimers;
  private readonly random: () => number;
  private readonly backoff: ReconnectBackoff;
  private readonly maxReconnectMs: number;
  private active = false;
  private generation = 0;
  private connecting = false;
  private xhr: IncrementalXhr | null = null;
  private parser: SseParser | null = null;
  private responseOffset = 0;
  private reconnectTimer: unknown;
  private suppressFailure = false;
  private connected = false;

  constructor(options: LiveEventTransportOptions) {
    this.options = options;
    this.xhrFactory = options.xhrFactory ?? defaultXhrFactory;
    this.timers = options.timers ?? defaultTimers;
    this.random = options.random ?? Math.random;
    const minReconnectMs = options.minReconnectMs ?? 1_000;
    this.maxReconnectMs = options.maxReconnectMs ?? 30_000;
    this.backoff = new ReconnectBackoff(minReconnectMs, this.maxReconnectMs, options.backoffFactor ?? 1.8);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.generation += 1;
    this.backoff.reset();
    this.emit({ kind: "connecting" });
    void this.connect(this.generation);
  }

  stop() {
    if (!this.active && !this.xhr && this.reconnectTimer === undefined) return;
    this.active = false;
    this.generation += 1;
    this.connecting = false;
    this.connected = false;
    if (this.reconnectTimer !== undefined) {
      this.timers.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const xhr = this.xhr;
    this.xhr = null;
    this.parser = null;
    this.responseOffset = 0;
    if (xhr) {
      this.suppressFailure = true;
      xhr.abort();
      this.suppressFailure = false;
    }
    this.emit({ kind: "stopped" });
  }

  private async connect(generation: number) {
    if (!this.active || generation !== this.generation || this.connecting) return;
    this.connecting = true;
    let token: string | null;
    let path: string;
    try {
      token = typeof this.options.token === "function" ? await this.options.token() : this.options.token;
      path = typeof this.options.path === "function" ? this.options.path() : this.options.path;
    } catch {
      this.connecting = false;
      this.fail(generation);
      return;
    }
    if (!this.active || generation !== this.generation) {
      this.connecting = false;
      return;
    }

    let xhr: IncrementalXhr;
    try {
      xhr = this.xhrFactory();
      this.parser = new SseParser();
      this.responseOffset = 0;
      this.xhr = xhr;
      xhr.onreadystatechange = () => this.readyStateChanged(xhr, generation);
      xhr.onprogress = () => this.processResponse(xhr, generation);
      xhr.onload = () => {
        this.processResponse(xhr, generation);
        const parser = this.parser;
        if (parser && this.xhr === xhr) {
          for (const event of parser.finish()) this.options.onData(event.data);
        }
        if (!this.suppressFailure) this.fail(generation, xhr.status || undefined, xhr);
      };
      xhr.onerror = () => this.fail(generation, xhr.status || undefined, xhr);
      xhr.ontimeout = () => this.fail(generation, xhr.status || undefined, xhr);
      xhr.open("GET", path, true);
      xhr.setRequestHeader("accept", "text/event-stream");
      if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
      this.connecting = false;
      xhr.send();
    } catch {
      this.connecting = false;
      this.fail(generation);
    }
  }

  private readyStateChanged(xhr: IncrementalXhr, generation: number) {
    if (!this.active || generation !== this.generation || xhr !== this.xhr) return;
    const status = xhr.status;
    if (status === 401 || status === 403) {
      this.unauthorized(generation, status);
      return;
    }
    if (status >= 200 && status < 300) {
      this.backoff.reset();
      if (!this.connected) {
        this.connected = true;
        this.emit({ kind: "connected" });
      }
      this.processResponse(xhr, generation);
    } else if (status >= 400) {
      this.fail(generation, status);
    }
  }

  private processResponse(xhr: IncrementalXhr, generation: number) {
    if (!this.active || generation !== this.generation || xhr !== this.xhr) return;
    if (xhr.status === 401 || xhr.status === 403) {
      this.unauthorized(generation, xhr.status);
      return;
    }
    const response = xhr.responseText ?? "";
    if (response.length < this.responseOffset) this.responseOffset = 0;
    const chunk = response.slice(this.responseOffset);
    this.responseOffset = response.length;
    if (!chunk || !this.parser) return;
    for (const event of this.parser.push(chunk)) this.options.onData(event.data);
  }

  private unauthorized(generation: number, status: number) {
    if (!this.active || generation !== this.generation) return;
    this.active = false;
    this.connected = false;
    this.suppressFailure = true;
    this.xhr?.abort();
    this.suppressFailure = false;
    this.xhr = null;
    this.parser = null;
    this.emit({ kind: "unauthorized", status });
  }

  private fail(generation: number, status?: number, source?: IncrementalXhr) {
    if (!this.active || generation !== this.generation || this.suppressFailure || (source && source !== this.xhr)) return;
    this.connected = false;
    const xhr = this.xhr;
    this.xhr = null;
    this.parser = null;
    this.responseOffset = 0;
    if (xhr) {
      this.suppressFailure = true;
      xhr.abort();
      this.suppressFailure = false;
    }
    this.emit({ kind: "unreachable", ...(status !== undefined ? { status } : {}) });
    this.scheduleReconnect(generation, status);
  }

  private scheduleReconnect(generation: number, status?: number) {
    if (!this.active || this.reconnectTimer !== undefined) return;
    const baseDelay = this.backoff.next();
    const jitter = Math.max(0, Math.min(1, this.random()));
    const delayMs = Math.min(this.maxReconnectMs, Math.round(baseDelay * (1 + jitter)));
    this.emit({ kind: "reconnecting", delayMs, reason: "unreachable", ...(status !== undefined ? { status } : {}) });
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(generation);
    }, delayMs);
  }

  private emit(status: LiveEventTransportStatus) {
    this.options.onStatus?.(status);
  }
}
