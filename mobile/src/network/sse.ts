export interface SseEvent {
  event?: string;
  id?: string;
  retry?: number;
  data: string;
}

/** Incremental SSE parser; comments and keepalives are ignored. */
export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private event: string | undefined;
  private id: string | undefined;
  private retry: number | undefined;

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      let line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line) {
        const next = this.flush();
        if (next) out.push(next);
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "data") this.data.push(value);
      else if (field === "event") this.event = value;
      else if (field === "id" && !value.includes("\u0000")) this.id = value;
      else if (field === "retry" && /^\d+$/.test(value)) this.retry = Number(value);
    }
    return out;
  }

  finish(): SseEvent[] {
    if (this.buffer) return this.push(`${this.buffer}\n\n`);
    const next = this.flush();
    return next ? [next] : [];
  }

  private flush(): SseEvent | null {
    if (!this.data.length && this.event === undefined && this.id === undefined && this.retry === undefined) {
      return null;
    }
    const result: SseEvent = {
      ...(this.event !== undefined ? { event: this.event } : {}),
      ...(this.id !== undefined ? { id: this.id } : {}),
      ...(this.retry !== undefined ? { retry: this.retry } : {}),
      data: this.data.join("\n"),
    };
    this.data = [];
    this.event = this.id = this.retry = undefined;
    return result;
  }
}

export interface EventFrame {
  kind?: string;
  _seq?: number;
  [key: string]: unknown;
}

export interface ObservedFrame<T extends EventFrame = EventFrame> {
  frame: T;
  sequence: number | null;
  replayed: boolean;
  rehydrate: boolean;
}

/** Tracks the server's numeric cursor and the hello replay boundary. */
export class EventStreamCursor {
  private sequence = 0;
  private replayUntil = 0;
  private rehydrate = false;

  get lastSequence() {
    return this.sequence;
  }

  nextPath(path = "/api/events") {
    const join = path.includes("?") ? "&" : "?";
    return this.sequence > 0 ? `${path}${join}since=${this.sequence}` : path;
  }

  observe<T extends EventFrame>(data: string): ObservedFrame<T> | null {
    let frame: T;
    try {
      frame = JSON.parse(data) as T;
    } catch {
      return null;
    }
    const sequence = typeof frame._seq === "number" && Number.isFinite(frame._seq) ? frame._seq : null;
    if (sequence !== null) this.sequence = Math.max(this.sequence, sequence);
    if (frame.kind === "hello") {
      // A lower hello sequence identifies a restarted server/event log. Do
      // not keep asking the new server for a cursor that only existed in the
      // previous epoch.
      if (sequence !== null && sequence < this.sequence) this.sequence = sequence;
      this.replayUntil = sequence ?? 0;
      this.rehydrate = (frame as EventFrame & { resumed?: unknown }).resumed === false;
      return { frame, sequence, replayed: false, rehydrate: this.rehydrate };
    }
    return {
      frame,
      sequence,
      replayed: sequence !== null && sequence <= this.replayUntil,
      rehydrate: this.rehydrate,
    };
  }

  consumeRehydrate() {
    const needed = this.rehydrate;
    this.rehydrate = false;
    return needed;
  }
}

export class ReconnectBackoff {
  private current: number;
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly factor: number;
  constructor(minMs = 1_000, maxMs = 30_000, factor = 1.8) {
    this.minMs = minMs;
    this.maxMs = maxMs;
    this.factor = factor;
    this.current = minMs;
  }
  reset() {
    this.current = this.minMs;
  }
  next() {
    const delay = this.current;
    this.current = Math.min(this.maxMs, Math.round(this.current * this.factor));
    return delay;
  }
}
