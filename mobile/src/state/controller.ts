import {
  createInitialState,
  reducer,
  type Action,
  type AppState,
} from "@bloks/core/reducer";
import type { ConfigStatus, InstanceInfo, ProviderRow } from "@bloks/core/contracts";
import { EventStreamCursor, type EventFrame } from "../network/sse.ts";
import {
  normalizeBlok,
  normalizeBotPatch,
  normalizeConfig,
  normalizeInstance,
  normalizeMessage,
  normalizeProvider,
} from "../network/hydration.ts";
import type { MobileHydratedWorkspace } from "../network/hydration.ts";

export interface RehydrateRequest {
  reason: "replay-gap";
  sequence: number | null;
}

export interface NotificationHint {
  /** No notification is produced here; this is only a handoff to a UI layer. */
  eligible: boolean;
  replayed: boolean;
  threadId?: string;
}

export interface FoldResult {
  state: AppState;
  applied: boolean;
  sequence: number | null;
  replayed: boolean;
  rehydrateRequested: boolean;
  notification: NotificationHint;
}

export interface StateControllerOptions {
  initialState?: AppState;
  onRehydrateRequested?: (request: RehydrateRequest) => void;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function normalizedRuntime(frame: Record<string, unknown>): { type: string; threadId: string; streamKind?: string; delta?: string } | null {
  const event = record(frame.event);
  if (!event || !isString(event.type) || !isString(event.threadId)) return null;
  return {
    type: event.type,
    threadId: event.threadId,
    ...(isString(event.streamKind) ? { streamKind: event.streamKind } : {}),
    ...(isString(event.delta) ? { delta: event.delta } : {}),
  };
}

function configFrame(frame: Record<string, unknown>): ConfigStatus | null {
  const nested = record(frame.config);
  if (nested) return normalizeConfig(nested);
  const { kind: _kind, _seq: _seq, ...payload } = frame;
  return normalizeConfig(payload);
}

/** Apply a complete server snapshot through the same reducer as live frames. */
export function applyHydration(state: AppState, workspace: MobileHydratedWorkspace): AppState {
  let next = reducer(state, { type: "hydrate", bots: workspace.bots });
  next = reducer(next, { type: "hydrateBloks", bloks: workspace.bloks });
  next = reducer(next, { type: "instances", instances: workspace.instances });
  next = reducer(next, { type: "providers", providers: workspace.providers });
  if (workspace.config) next = reducer(next, { type: "configStatus", config: workspace.config });
  // A snapshot supersedes any partial runtime bubble from the old stream.
  return { ...next, streaming: {} };
}

/**
 * Native event/state boundary. It owns the cursor but deliberately has no
 * fetch, SSE socket, React, or notification dependency; lifecycle code can
 * reconnect and call fold() with each parsed data payload.
 */
export class MobileStateController {
  private current: AppState;
  private readonly cursor = new EventStreamCursor();
  private readonly onRehydrateRequested?: StateControllerOptions["onRehydrateRequested"];
  private rehydratePending = false;
  private bufferedFrames: string[] = [];

  constructor(options: StateControllerOptions = {}) {
    this.current = options.initialState ?? createInitialState();
    this.onRehydrateRequested = options.onRehydrateRequested;
  }

  get state(): AppState {
    return this.current;
  }

  get lastSequence(): number {
    return this.cursor.lastSequence;
  }

  nextEventsPath(path = "/api/events"): string {
    return this.cursor.nextPath(path);
  }

  hydrate(workspace: MobileHydratedWorkspace): AppState {
    this.current = applyHydration(this.current, workspace);
    if (this.rehydratePending) {
      const buffered = this.bufferedFrames;
      this.bufferedFrames = [];
      this.rehydratePending = false;
      for (const frame of buffered) this.fold(frame);
    }
    return this.current;
  }

  dispatch(action: Action): AppState {
    this.current = reducer(this.current, action);
    return this.current;
  }

  fold(raw: string | EventFrame | unknown): FoldResult {
    let data: string;
    try {
      data = typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      return this.ignored(null, false);
    }
    let observed: ReturnType<EventStreamCursor["observe"]>;
    try {
      // EventStreamCursor owns sequence bookkeeping; the guard here keeps a
      // JSON `null` (which is valid JSON but not an event) from escaping as
      // an exception before the cursor can reject it.
      observed = this.cursor.observe(data);
    } catch {
      return this.ignored(null, false);
    }
    if (!observed) return this.ignored(null, false);
    const frame = record(observed.frame);
    const sequence = observed.sequence;
    const replayed = observed.replayed;
    if (!frame || !isString(frame.kind)) return this.ignored(sequence, replayed);

    if (frame.kind === "hello") {
      const requested = frame.resumed === false;
      if (requested) {
        this.rehydratePending = true;
        this.onRehydrateRequested?.({ reason: "replay-gap", sequence });
      }
      this.cursor.consumeRehydrate();
      return {
        state: this.current,
        applied: true,
        sequence,
        replayed,
        rehydrateRequested: requested,
        notification: { eligible: false, replayed },
      };
    }

    if (this.rehydratePending) {
      this.bufferedFrames.push(data);
      return {
        state: this.current,
        applied: false,
        sequence,
        replayed,
        rehydrateRequested: false,
        notification: { eligible: false, replayed },
      };
    }

    let action: Action | null = null;
    let notification: NotificationHint = { eligible: false, replayed };
    switch (frame.kind) {
      case "message":
      case "message.patch": {
        if (!isString(frame.threadId)) break;
        const message = normalizeMessage(frame.message);
        if (!message) break;
        action = frame.kind === "message"
          ? { type: "messageAdded", threadId: frame.threadId, message }
          : { type: "messagePatched", threadId: frame.threadId, message };
        notification = {
          eligible: !replayed && message.role === "bot" && message.kind === "text",
          replayed,
          threadId: frame.threadId,
        };
        break;
      }
      case "bot": {
        const bot = normalizeBotPatch(frame.bot);
        if (bot) action = { type: "botPatched", bot };
        break;
      }
      case "bot.deleted":
        if (isString(frame.botId)) action = { type: "deleteBot", botId: frame.botId, forget: true };
        break;
      case "runtime": {
        const event = normalizedRuntime(frame);
        if (!event) break;
        if (event.type === "content.delta" && event.streamKind === "assistant_text" && event.delta) {
          action = { type: "streamDelta", threadId: event.threadId, delta: event.delta };
        } else if (event.type === "turn.completed") {
          action = { type: "streamClear", threadId: event.threadId };
        }
        break;
      }
      case "blok": {
        const blok = normalizeBlok(frame.blok);
        if (blok) {
          // Live blok broadcasts are usually metadata-only. Do not replace
          // a locally hydrated transcript with the normalizer's empty list.
          if (record(frame.blok)?.messages === undefined) {
            const { messages: _messages, ...metadata } = blok;
            action = { type: "blokPatched", blok: metadata };
          } else {
            action = { type: "blokPatched", blok };
          }
        }
        break;
      }
      case "blok.deleted":
        if (isString(frame.blokId)) action = { type: "blokDeleted", blokId: frame.blokId };
        break;
      case "instances": {
        const values = Array.isArray(frame.instances) ? frame.instances : [];
        const instances = values.map(normalizeInstance).filter((instance): instance is InstanceInfo => instance !== null);
        if (values.length === 0 || instances.length > 0) action = { type: "instances", instances };
        break;
      }
      case "providers":
        if (Array.isArray(frame.providers)) {
          const providers = frame.providers.map(normalizeProvider).filter((provider): provider is ProviderRow => provider !== null);
          if (frame.providers.length === 0 || providers.length > 0) action = { type: "providers", providers };
        }
        break;
      case "config": {
        const config = configFrame(frame);
        if (config) action = { type: "configStatus", config };
        break;
      }
      case "screen":
        if (isString(frame.botId) && isString(frame.png)) action = { type: "screenFrame", botId: frame.botId, png: frame.png, mime: isString(frame.mime) ? frame.mime : "image/png" };
        break;
      case "computer":
        if (isString(frame.botId) && isString(frame.state)) action = { type: "provisioning", botId: frame.botId, on: frame.state === "provisioning" };
        break;
      default:
        break;
    }
    if (action) this.current = reducer(this.current, action);
    return {
      state: this.current,
      applied: action !== null,
      sequence,
      replayed,
      rehydrateRequested: false,
      notification,
    };
  }

  private ignored(sequence: number | null, replayed: boolean): FoldResult {
    return {
      state: this.current,
      applied: false,
      sequence,
      replayed,
      rehydrateRequested: false,
      notification: { eligible: false, replayed },
    };
  }
}
