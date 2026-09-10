import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialState, reducer, type Bot, type Message } from "../packages/bloks-core/src/reducer.ts";

const bot = (id: string): Bot => ({
  id,
  threadId: `t-${id}`,
  name: id,
  title: "",
  description: "",
  notifications: true,
  color: "blue",
  unread: false,
  modelSelection: { instanceId: "test", model: "test" },
  messages: [],
});

const message = (id: string): Message => ({ id, role: "bot", kind: "text", text: "hello", at: 1 });

test("core initial state is seeded without browser storage", () => {
  assert.equal(typeof globalThis.localStorage, "undefined");
  const state = createInitialState({ selectedId: "seed", projectId: "project" });
  assert.equal(state.selectedId, "seed");
  assert.equal(state.projectId, "project");
});

test("core reducer routes and deduplicates messages", () => {
  const state = createInitialState({ selectedId: "a" });
  const withBot = reducer(
    { ...state, bots: [bot("a")] },
    { type: "messageAdded", threadId: "t-a", message: message("m1") },
  );
  const twice = reducer(withBot, { type: "messageAdded", threadId: "t-a", message: message("m1") });
  assert.deepEqual(
    twice.bots[0].messages.map((item) => item.id),
    ["m1"],
  );
});
