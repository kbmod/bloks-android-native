import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_STORAGE_SERVICE,
  KeychainSecureConnectionStorage,
  type KeychainAdapter,
} from "../mobile/src/security/secure-connection-storage.ts";

const token = "a".repeat(48);
const connection = { baseUrl: "http://192.168.1.20:8787", deviceId: "pixel" };

class MemoryKeychain implements KeychainAdapter {
  password: string | null = null;
  username: string | null = null;
  options: unknown;
  resets = 0;

  async setGenericPassword(
    username: string,
    password: string,
    options?: Parameters<KeychainAdapter["setGenericPassword"]>[2],
  ) {
    this.username = username;
    this.password = password;
    this.options = options;
    return { service: CONNECTION_STORAGE_SERVICE, storage: "memory" };
  }

  async getGenericPassword(_options?: Parameters<KeychainAdapter["getGenericPassword"]>[0]) {
    return this.password === null
      ? false as const
      : { username: this.username!, password: this.password };
  }

  async resetGenericPassword(_options?: Parameters<KeychainAdapter["resetGenericPassword"]>[0]) {
    this.password = null;
    this.username = null;
    this.resets += 1;
    return true;
  }
}

test("secure connection storage round trips token and connection coherently", async () => {
  const keychain = new MemoryKeychain();
  const storage = new KeychainSecureConnectionStorage(keychain);
  await storage.writeToken(token);
  assert.equal(await storage.readToken(), token);
  assert.equal(await storage.readConnection(), null);
  await storage.writeConnection(connection);
  assert.deepEqual(await storage.readConnection(), connection);
  assert.equal(await storage.readToken(), token);
  assert.deepEqual(keychain.options, { service: CONNECTION_STORAGE_SERVICE });
});

test("paired writes persist the token and connection as one credential", async () => {
  const keychain = new MemoryKeychain();
  const storage = new KeychainSecureConnectionStorage(keychain);
  await storage.writePairedConnection(token, connection);
  assert.equal(await storage.readToken(), token);
  assert.deepEqual(await storage.readConnection(), connection);
});

test("missing data restores as null", async () => {
  const storage = new KeychainSecureConnectionStorage(new MemoryKeychain());
  assert.equal(await storage.readToken(), null);
  assert.equal(await storage.readConnection(), null);
});

test("malformed stored payload is rejected and cleared", async () => {
  const keychain = new MemoryKeychain();
  keychain.username = "paired-connection";
  keychain.password = JSON.stringify({ version: 1, token: token, connection: { baseUrl: "not a url" } });
  const storage = new KeychainSecureConnectionStorage(keychain);
  assert.equal(await storage.readToken(), null);
  assert.equal(keychain.password, null);
  assert.equal(keychain.resets, 1);
});

test("invalid tokens are rejected before writing", async () => {
  const keychain = new MemoryKeychain();
  const storage = new KeychainSecureConnectionStorage(keychain);
  await assert.rejects(storage.writeToken("short"), /invalid device token/);
  assert.equal(keychain.password, null);
});

test("clearConnection removes the complete credential", async () => {
  const keychain = new MemoryKeychain();
  const storage = new KeychainSecureConnectionStorage(keychain);
  await storage.writeToken(token);
  await storage.writeConnection(connection);
  await storage.clearConnection();
  assert.equal(await storage.readToken(), null);
  assert.equal(await storage.readConnection(), null);
});
