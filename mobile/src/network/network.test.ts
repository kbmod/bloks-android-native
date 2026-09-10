import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "./api.ts";
import { parsePairingLink } from "./pairing.ts";
import { EventStreamCursor, SseParser } from "./sse.ts";
import { apiUrl, validateBaseUrl } from "./url.ts";

test("base URLs and API paths are constrained", () => {
  assert.equal(validateBaseUrl("192.168.1.4:8799/"), "http://192.168.1.4:8799");
  assert.equal(apiUrl("https://example.test", "/api/bots"), "https://example.test/api/bots");
  assert.throws(() => validateBaseUrl("javascript:alert(1)"));
  assert.throws(() => apiUrl("https://example.test", "/etc/passwd"));
});

test("pairing links validate and expose only the claim credential", () => {
  const link = parsePairingLink(
    "bloks://pair?address=192.168.1.4%3A8799&token=bloks_pair_12345678901234567890123456789012&code=123456&name=Mac%20Book",
  );
  assert.equal(link.baseUrl, "http://192.168.1.4:8799");
  assert.equal(link.credential, link.token);
  assert.equal(link.computerName, "Mac Book");
  assert.throws(() => parsePairingLink("bloks://pair?address=x:8799&code=bad"));
});

test("SSE parser handles fragmented data and comments", () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push(": keepalive\n\nda"), []);
  assert.deepEqual(parser.push("ta: {\"kind\":\"hello\"}\n\n"), [{ data: '{"kind":"hello"}' }]);
});

test("event cursor preserves sequence across hello replay", () => {
  const cursor = new EventStreamCursor();
  assert.equal(cursor.observe('{"kind":"hello","_seq":10,"resumed":true}')?.rehydrate, false);
  assert.equal(cursor.observe('{"kind":"message","_seq":8}')?.replayed, true);
  assert.equal(cursor.observe('{"kind":"message","_seq":11}')?.replayed, false);
  assert.equal(cursor.nextPath(), "/api/events?since=11");
  const gap = new EventStreamCursor();
  assert.equal(gap.observe('{"kind":"hello","_seq":3,"resumed":false}')?.rehydrate, true);
  assert.equal(gap.consumeRehydrate(), true);
});

test("event cursor resets its sequence when a restarted server says hello lower", () => {
  const cursor = new EventStreamCursor();
  cursor.observe('{"kind":"hello","_seq":20,"resumed":true}');
  cursor.observe('{"kind":"message","_seq":21}');
  const hello = cursor.observe('{"kind":"hello","_seq":2,"resumed":true}');
  assert.equal(hello?.sequence, 2);
  assert.equal(cursor.lastSequence, 2);
  assert.equal(cursor.nextPath(), "/api/events?since=2");
});

test("typed API client injects bearer and throws bounded API errors", async () => {
  let seen: RequestInit | undefined;
  const client = new ApiClient({
    baseUrl: "https://example.test",
    token: "device-token",
    fetcher: async (_input, init) => {
      seen = init;
      return new Response(JSON.stringify({ error: "nope" }), { status: 401, statusText: "Unauthorized" });
    },
  });
  await assert.rejects(() => client.get("/api/bots"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(new Headers(seen?.headers).get("authorization"), "Bearer device-token");
});
