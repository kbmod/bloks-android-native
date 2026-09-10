import { test } from "node:test";
import assert from "node:assert/strict";

import type { Blok, Bot, Message } from "../packages/bloks-core/src/contracts.ts";
import { createInitialState } from "../packages/bloks-core/src/reducer.ts";
import {
  hydrateWorkspace,
  normalizeMessage,
  normalizeConfig,
  type MobileHydratedWorkspace,
} from "../mobile/src/network/hydration.ts";
import { MobileStateController } from "../mobile/src/state/controller.ts";

const message = (id: string, text = "hello"): Message => ({
  id,
  role: "bot",
  kind: "text",
  text,
  at: 1,
});

const bot = (id = "b1"): Bot => ({
  id,
  threadId: `thread-${id}`,
  name: id,
  title: "A bot",
  description: "",
  notifications: true,
  color: "blue",
  unread: false,
  modelSelection: { instanceId: "test", model: "test" },
  messages: [],
});

const blok: Blok = {
  id: "room-1",
  name: "Room",
  memberIds: ["b1"],
  createdAt: 1,
  messages: [],
};

const workspace: MobileHydratedWorkspace = {
  bots: [bot()],
  bloks: [blok],
  instances: [],
  providers: [],
  config: normalizeConfig({ composio: { configured: true }, box: { configured: false }, future: { enabled: true } }),
};

test("mobile hydration requests all typed snapshots and preserves extensions", async () => {
  const calls: string[] = [];
  const payloads: Record<string, unknown> = {
    "/api/bots?messages=50": {
      bots: [{ ...bot(), futureBotField: "kept", messages: [{ ...message("m1"), futureMessageField: 7 }] }],
    },
    "/api/bloks": { bloks: [{ ...blok, futureRoomField: true }] },
    "/api/instances": { instances: [] },
    "/api/providers": { providers: [] },
    "/api/config": { composio: { configured: true }, box: { configured: false }, future: { enabled: true } },
  };
  const hydrated = await hydrateWorkspace({
    async get<T>(path: string): Promise<T> {
      calls.push(path);
      return payloads[path] as T;
    },
  });

  assert.equal(calls.length, 5);
  assert.deepEqual(new Set(calls), new Set(Object.keys(payloads)));
  assert.equal((hydrated.bots[0] as Bot & { futureBotField: string }).futureBotField, "kept");
  assert.equal((hydrated.bots[0].messages[0] as Message & { futureMessageField: number }).futureMessageField, 7);
  assert.equal((hydrated.bloks[0] as Blok & { futureRoomField: boolean }).futureRoomField, true);
  assert.deepEqual((hydrated.config as ConfigWithFuture).future, { enabled: true });
});

type ConfigWithFuture = MobileHydratedWorkspace["config"] & { future: { enabled: boolean } };

test("event controller folds duplicate messages, streaming, rooms, and deletion", () => {
  const controller = new MobileStateController({ initialState: createInitialState() });
  controller.hydrate(workspace);
  controller.fold(JSON.stringify({ kind: "hello", _seq: 1, resumed: true }));

  controller.fold(JSON.stringify({ kind: "message", _seq: 2, threadId: "thread-b1", message: message("m1") }));
  controller.fold(JSON.stringify({ kind: "message", _seq: 3, threadId: "thread-b1", message: message("m1") }));
  assert.deepEqual(controller.state.bots[0].messages.map((item) => item.id), ["m1"]);
  controller.fold({ kind: "message.patch", _seq: 3.5, threadId: "thread-b1", message: { ...message("m1", "edited"), future: "kept" } });
  assert.equal(controller.state.bots[0].messages[0].text, "edited");
  controller.fold({ kind: "bot", _seq: 3.6, bot: { id: "b1", busy: true, futureBotField: "safe" } });
  assert.equal(controller.state.bots[0].busy, true);

  controller.fold(JSON.stringify({
    kind: "runtime",
    _seq: 4,
    event: { type: "content.delta", threadId: "thread-b1", streamKind: "assistant_text", delta: "hel" },
  }));
  controller.fold(JSON.stringify({
    kind: "runtime",
    _seq: 5,
    event: { type: "content.delta", threadId: "thread-b1", streamKind: "other", delta: "ignored" },
  }));
  assert.equal(controller.state.streaming["thread-b1"], "hel");
  controller.fold(JSON.stringify({ kind: "runtime", _seq: 6, event: { type: "turn.completed", threadId: "thread-b1" } }));
  assert.equal(controller.state.streaming["thread-b1"], undefined);

  controller.fold({ kind: "blok", _seq: 7, blok: { ...blok, messages: [message("room-message")] } });
  assert.deepEqual(controller.state.bloks[0].messages.map((item) => item.id), ["room-message"]);
  controller.fold({ kind: "blok", _seq: 7.5, blok: { id: "room-1", name: "Renamed", memberIds: ["b1"], createdAt: 1 } });
  assert.equal(controller.state.bloks[0].name, "Renamed");
  assert.deepEqual(controller.state.bloks[0].messages.map((item) => item.id), ["room-message"]);
  controller.fold({
    kind: "instances",
    _seq: 7.6,
    instances: [
      { instanceId: "i1", driverKind: "test", displayName: "Test", snapshot: { state: "available" }, models: { default: "m", options: [] } },
      { instanceId: "bad" },
    ],
  });
  controller.fold({
    kind: "providers",
    _seq: 7.7,
    providers: [
      { kind: "test", name: "Test", auth: "none", keyHint: "", docsUrl: "", connected: true, agentic: false },
      { kind: "bad" },
    ],
  });
  controller.fold({ kind: "config", _seq: 7.8, config: { composio: { configured: true }, box: { configured: false }, future: 1 } });
  assert.equal(controller.state.instances[0].instanceId, "i1");
  assert.equal(controller.state.providers[0].connected, true);
  assert.equal((controller.state.config as unknown as { future: number }).future, 1);
  controller.fold({ kind: "bot.deleted", _seq: 8, botId: "b1", unknown: { safe: true } });
  assert.equal(controller.state.bots.length, 0);
});

test("replay gaps request rehydration and suppress notification eligibility", () => {
  let request: { reason: "replay-gap"; sequence: number | null } | undefined;
  const controller = new MobileStateController({
    initialState: createInitialState(),
    onRehydrateRequested(value) {
      request = value;
    },
  });
  const hello = controller.fold('{"kind":"hello","_seq":20,"resumed":false}');
  assert.equal(hello.rehydrateRequested, true);
  assert.deepEqual(request, { reason: "replay-gap", sequence: 20 });

  const replayed = controller.fold({ kind: "message", _seq: 19, threadId: "missing", message: message("m1") });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.notification.eligible, false);
  assert.equal(controller.lastSequence, 20);
  assert.equal(controller.nextEventsPath(), "/api/events?since=20");
});

test("replay-gap frames wait for hydration, then replay after the snapshot", () => {
  const controller = new MobileStateController({ initialState: createInitialState() });
  controller.fold({ kind: "hello", _seq: 20, resumed: false });
  const old = controller.fold({ kind: "message", _seq: 19, threadId: "thread-b1", message: message("replayed") });
  const live = controller.fold({ kind: "message", _seq: 21, threadId: "thread-b1", message: message("live") });
  assert.equal(old.applied, false);
  assert.equal(live.applied, false);
  assert.deepEqual(controller.state.bots, []);

  controller.hydrate(workspace);
  const finalState = controller.state;
  const hydratedBot = finalState.bots[0];
  assert.ok(hydratedBot);
  assert.deepEqual(hydratedBot.messages.map((item) => item.id), ["replayed", "live"]);
});

test("malformed known message fields are dropped while extensions survive", () => {
  const normalized = normalizeMessage({
    id: "message-1",
    role: "bot",
    kind: "text",
    at: 1,
    text: { unsafe: true },
    queued: "yes",
    artifact: "unsafe",
    secret: { envName: "TOKEN", label: "Token", status: "unknown" },
    futureField: "kept",
  });
  if (!normalized) throw new Error("expected valid base message");
  assert.equal(normalized.text, undefined);
  assert.equal(normalized.queued, undefined);
  assert.equal(normalized.artifact, undefined);
  assert.equal(normalized.secret, undefined);
  assert.equal((normalized as Message & { futureField: string }).futureField, "kept");
  assert.equal(normalizeMessage({ id: "   ", role: "bot", kind: "text", at: 1 }), null);
});

test("unknown and malformed frames are ignored without crashing", () => {
  const controller = new MobileStateController();
  assert.equal(controller.fold("not json").applied, false);
  assert.equal(controller.fold("null").applied, false);
  assert.equal(controller.fold({ kind: "future.kind", _seq: 3, nested: { any: "thing" } }).applied, false);
  assert.equal(controller.fold({ kind: "message", _seq: 4, threadId: "x", message: { id: "bad", role: "robot" } }).applied, false);
  assert.equal(controller.fold({ kind: "runtime", _seq: 5, event: { type: "content.delta" } }).applied, false);
  assert.equal(controller.lastSequence, 5);
  assert.equal(controller.state.bots.length, 0);
});
