import assert from "node:assert/strict";
import test from "node:test";
import type { MobileHydratedWorkspace } from "../network/hydration.ts";
import type { LiveEventTransportOptions } from "../network/live-event-transport.ts";
import type { SecureConnectionStorage } from "../security/token-storage.ts";
import { WorkspaceSessionCoordinator } from "./session-coordinator.ts";

const workspace: MobileHydratedWorkspace = {bots: [], bloks: [], instances: [], providers: [], config: null};

function storage(token = "a".repeat(48)): SecureConnectionStorage {
  return {
    readToken: async () => token,
    writeToken: async () => {},
    clearToken: async () => {},
    readConnection: async () => ({baseUrl: "https://example.test"}),
    writeConnection: async () => {},
    writePairedConnection: async () => {},
    clearConnection: async () => {},
  };
}

class FakeTransport {
  starts = 0;
  stops = 0;
  readonly options: LiveEventTransportOptions;
  constructor(options: LiveEventTransportOptions) { this.options = options; }
  start() { this.starts += 1; this.options.onStatus?.({kind: "connected"}); }
  stop() { this.stops += 1; this.options.onStatus?.({kind: "stopped"}); }
}

test("session hydrates before opening an absolute event stream and uses fresh keychain tokens", async () => {
  let hydrated = 0;
  let transport: FakeTransport | undefined;
  const session = new WorkspaceSessionCoordinator({
    baseUrl: "https://example.test",
    storage: storage("b".repeat(48)),
    hydrate: async () => { hydrated += 1; return workspace; },
    transportFactory: (options) => { transport = new FakeTransport(options); return transport; },
  });
  await session.start();
  assert.equal(hydrated, 1);
  assert.equal(transport?.starts, 1);
  assert.equal(transport?.options.path instanceof Function, true);
  assert.equal((transport?.options.path as () => string)(), "https://example.test/api/events");
  assert.equal(await (transport?.options.token as () => Promise<string | null>)(), "b".repeat(48));
  assert.equal(session.snapshot.status, "connected");
  assert.equal(session.snapshot.state.connected, true);
});

test("snapshot identity is cached and live frames notify roster subscribers", async () => {
  let transport: FakeTransport | undefined;
  const session = new WorkspaceSessionCoordinator({
    baseUrl: "https://example.test",
    storage: storage(),
    hydrate: async () => workspace,
    transportFactory: (options) => { transport = new FakeTransport(options); return transport; },
  });
  assert.equal(session.snapshot, session.snapshot);
  let notifications = 0;
  session.subscribe(() => { notifications += 1; });
  await session.start();
  const before = session.snapshot;
  transport?.options.onData('{"kind":"hello","_seq":1,"resumed":true}');
  assert.notEqual(session.snapshot, before);
  assert.ok(notifications > 0);
});

test("replay gaps trigger a second hydration and status transitions remain bounded", async () => {
  let hydrated = 0;
  let transport: FakeTransport | undefined;
  const statuses: string[] = [];
  const session = new WorkspaceSessionCoordinator({
    baseUrl: "https://example.test",
    storage: storage(),
    hydrate: async () => { hydrated += 1; return workspace; },
    transportFactory: (options) => { transport = new FakeTransport(options); return transport; },
  });
  const unsubscribe = session.subscribe(() => statuses.push(session.snapshot.status));
  await session.start();
  transport?.options.onData('{"kind":"hello","_seq":4,"resumed":false}');
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(hydrated, 2);
  assert.ok(statuses.includes("hydrating"));
  transport?.options.onStatus?.({kind: "unreachable"});
  transport?.options.onStatus?.({kind: "reconnecting", delayMs: 10, reason: "unreachable"});
  assert.equal(session.snapshot.status, "reconnecting");
  unsubscribe();
});

test("stop fully disconnects the stream and prevents later frames from changing state", async () => {
  let transport: FakeTransport | undefined;
  const session = new WorkspaceSessionCoordinator({
    baseUrl: "https://example.test",
    storage: storage(),
    hydrate: async () => workspace,
    transportFactory: (options) => { transport = new FakeTransport(options); return transport; },
  });
  await session.start();
  session.stop();
  assert.equal(transport?.stops, 1);
  assert.equal(session.snapshot.status, "stopped");
  assert.equal(session.snapshot.state.connected, false);
  transport?.options.onData('{"kind":"hello","_seq":5,"resumed":true}');
  assert.equal(session.snapshot.status, "stopped");
});

test("restart during pending hydration starts a fresh generation", async () => {
  let firstResolve: ((value: MobileHydratedWorkspace) => void) | undefined;
  let calls = 0;
  let starts = 0;
  const session = new WorkspaceSessionCoordinator({
    baseUrl: "https://example.test",
    storage: storage(),
    hydrate: async () => {
      calls += 1;
      if (calls === 1) return new Promise<MobileHydratedWorkspace>((resolve) => { firstResolve = resolve; });
      return workspace;
    },
    transportFactory: () => ({start: () => { starts += 1; }, stop: () => {}}),
  });
  const initial = session.start();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(calls, 1);
  session.stop();
  await session.start();
  assert.equal(calls, 2);
  assert.equal(starts, 1);
  firstResolve?.(workspace);
  await initial;
  assert.equal(starts, 1);
});

test("initial hydration failures surface as unreachable or unauthorized", async () => {
  for (const [error, expected] of [[{status: 401}, "unauthorized"], [new TypeError("offline"), "unreachable"]] as const) {
    const session = new WorkspaceSessionCoordinator({
      baseUrl: "https://example.test",
      storage: storage(),
      hydrate: async () => { throw error; },
    });
    await session.start();
    assert.equal(session.snapshot.status, expected);
  }
});
