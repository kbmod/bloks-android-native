import assert from "node:assert/strict";
import test from "node:test";
import { restoreSavedConnection } from "./connection-bootstrap.ts";
import type { PairedConnection, SecureConnectionStorage } from "../security/token-storage.ts";

function fakeStorage(token: string | null, connection: PairedConnection | null): SecureConnectionStorage {
  return {
    readToken: async () => token,
    writeToken: async () => {},
    clearToken: async () => {},
    readConnection: async () => connection,
    writeConnection: async () => {},
    writePairedConnection: async () => {},
    clearConnection: async () => {},
  };
}

test("startup restores only a complete secure connection record", async () => {
  const connection = {baseUrl: "http://192.168.1.20:8787", deviceId: "pixel"};
  assert.deepEqual(await restoreSavedConnection(fakeStorage("a".repeat(48), connection)), {
    token: "a".repeat(48),
    connection,
  });
  assert.equal(await restoreSavedConnection(fakeStorage("a".repeat(48), null)), null);
  assert.equal(await restoreSavedConnection(fakeStorage(null, connection)), null);
});
