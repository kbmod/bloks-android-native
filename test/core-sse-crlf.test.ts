import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSseChunk } from "../packages/bloks-core/src/events.ts";

test("core SSE parser accepts CRLF separators and fragmented CRLF input", () => {
  const first = parseSseChunk('data: {"kind":"hello"}\r\n\r');
  assert.deepEqual(first.frames, []);
  const second = parseSseChunk(`${first.remainder}\ndata: {"kind":"instances","instances":[]}\r\n\r\n`);
  assert.deepEqual(second.frames.map((frame) => frame.kind), ["hello", "instances"]);
  assert.equal(second.remainder, "");
});
