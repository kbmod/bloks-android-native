import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "./api.ts";
import {commandFailureKind, interruptBot, sendBotMessage} from "./commands.ts";

test("command failures distinguish definite API rejection from ambiguous network loss", () => {
  assert.equal(commandFailureKind(new ApiError(400, {error: "no"})), "rejected");
  assert.equal(commandFailureKind(new TypeError("network lost")), "unknown");
  assert.equal(commandFailureKind(Object.assign(new Error("timeout"), {name: "AbortError"})), "unknown");
});

test("agent commands encode ids, trim text, and preserve reply metadata", async () => {
  const calls: Array<{path: string; body: unknown}> = [];
  const client = {post: async <T>(path: string, body?: unknown) => {
    calls.push({path, body});
    return {} as T;
  }};
  await sendBotMessage(client, "agent/one?x", "  hello  ", "task/one", {id: "m", author: "Me", excerpt: "old"});
  await interruptBot(client, "agent/one?x", "task/one");
  assert.deepEqual(calls, [
    {path: "/api/bots/agent%2Fone%3Fx/messages", body: {text: "hello", taskId: "task/one", replyTo: {id: "m", author: "Me", excerpt: "old"}}},
    {path: "/api/bots/agent%2Fone%3Fx/interrupt", body: {taskId: "task/one"}},
  ]);
});

test("agent message command always binds the requested task", async () => {
  const calls: Array<{path: string; body: unknown}> = [];
  const client = {post: async <T>(path: string, body?: unknown) => {
    calls.push({path, body});
    return {} as T;
  }};
  await sendBotMessage(client, "bot", "message for old lane", "task-old");
  assert.deepEqual(calls[0], {
    path: "/api/bots/bot/messages",
    body: {text: "message for old lane", taskId: "task-old"},
  });
});

test("empty agent messages do not make an HTTP request", async () => {
  let calls = 0;
  await assert.rejects(() => sendBotMessage({post: async <T>() => {calls += 1; return {} as T; }}, "bot", " \n\t", "task"));
  assert.equal(calls, 0);
});
