import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEventData, parseSseChunk } from "../packages/bloks-core/src/events.ts";

test("core event parser rejects malformed or kindless JSON", () => {
  assert.equal(parseEventData("not json"), null);
  assert.equal(parseEventData(JSON.stringify({ message: "not a frame" })), null);
});

test("core SSE parser preserves incomplete chunks and parses data frames", () => {
  const first = parseSseChunk('data: {"kind":"hello","_seq":4}\n\ndata: {"kind":"message"');
  assert.equal(first.frames.length, 1);
  assert.equal(first.frames[0]?.kind, "hello");
  assert.equal(first.remainder, 'data: {"kind":"message"');

  const second = parseSseChunk(`${first.remainder}}\n\n: keepalive\n\n`);
  assert.equal(second.frames.length, 1);
  assert.equal(second.frames[0]?.kind, "message");
  assert.equal(second.remainder, "");
});
