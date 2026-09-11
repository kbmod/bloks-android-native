import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "@bloks/core/contracts";
import { fallbackMessageText, resolveConversationBot, settledTranscript } from "./conversation-model.ts";
import type { Bot } from "@bloks/core/contracts";

const message = (overrides: Partial<Message> = {}): Message => ({
  id: "m-1", role: "bot", kind: "text", at: 1, text: "hello", ...overrides,
});

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "agent", threadId: "task-a", name: "Agent", title: "", description: "",
  notifications: true, color: "blue", unread: false, modelSelection: {instanceId: "", model: ""}, messages: [],
  ...overrides,
});

test("conversation route fails closed when a live bot patch changes its lane", () => {
  const current = bot({activeTaskId: "task-b", threadId: "task-a"});
  assert.equal(resolveConversationBot([current], {botId: "agent", taskId: "task-a", threadId: "task-a"}), null);
  assert.equal(resolveConversationBot([current], {botId: "agent", taskId: "task-b", threadId: "task-a"}), current);
  assert.equal(resolveConversationBot([bot({activeTaskId: "task-b", threadId: "task-b"})], {botId: "agent", taskId: "task-a", threadId: "task-a"}), null);
});

test("settled transcript keeps native text, notice, and activity rows with markers", () => {
  const rows = settledTranscript([
    message({id: "u", role: "user", queued: true}),
    message({id: "n", kind: "notice", text: "notice", deleted: true}),
    message({id: "a", kind: "activity", text: "working"}),
  ]);
  assert.deepEqual(rows.map((row) => [row.id, row.kind, row.role, row.queued, row.deleted]), [
    ["u", "text", "user", true, false],
    ["n", "notice", "bot", false, true],
    ["a", "activity", "bot", false, false],
  ]);
});

test("activity fallback is bounded to the tool name and outcome", () => {
  const row = settledTranscript([message({id: "a", kind: "activity", text: undefined, tool: {name: "read_file", ok: false}})])[0];
  assert.equal(row?.text, "Activity: read_file (failed)");
});

test("rich and unknown messages are ignored by the settled native transcript", () => {
  assert.deepEqual(settledTranscript([
    message({kind: "options"}),
    message({kind: "component"}),
    message({kind: "text", text: ""}),
  ]), []);
  assert.equal(fallbackMessageText(message({kind: "artifact"})), "This message type is not available on Android yet.");
  assert.equal(fallbackMessageText(message({kind: "screen", text: ""})), null);
  assert.equal(fallbackMessageText({kind: "future.kind", text: "payload"}), "This message type is not available on Android yet.");
});
