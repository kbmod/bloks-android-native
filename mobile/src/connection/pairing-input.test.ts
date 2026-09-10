import assert from "node:assert/strict";
import test from "node:test";
import { classifyPairingFailure, parseManualPairing } from "./pairing-input.ts";

test("manual pairing accepts six-digit codes and one-time tokens", () => {
  const code = parseManualPairing("192.168.1.20:8787", "012345");
  assert.equal(code.baseUrl, "http://192.168.1.20:8787");
  assert.equal(code.code, "012345");
  const token = parseManualPairing("https://bloks.test", "bloks_pair_12345678901234567890123456789012");
  assert.equal(token.token, "bloks_pair_12345678901234567890123456789012");
});

test("manual pairing rejects malformed credentials and classifies failures", () => {
  assert.throws(() => parseManualPairing("not a host", "123456"));
  assert.throws(() => parseManualPairing("192.168.1.20:8787", "nope"), /six-digit/);
  assert.equal(classifyPairingFailure({ status: 401 }), "expired");
  assert.equal(classifyPairingFailure(new TypeError("network")), "unreachable");
});
