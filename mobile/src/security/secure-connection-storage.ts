import type { BaseOptions, GetOptions, SetOptions } from "react-native-keychain";

import { validateBaseUrl } from "../network/url.ts";
import {
  assertTokenShape,
  type PairedConnection,
  type SecureConnectionStorage,
} from "./token-storage.ts";

/** Dedicated Keychain service for the complete paired-device record. */
export const CONNECTION_STORAGE_SERVICE = "dev.bloks.mobile.connection";
const STORAGE_USERNAME = "paired-connection";
const RECORD_VERSION = 1;

/**
 * The narrow part of react-native-keychain used by this adapter. Injecting it
 * keeps unit tests native-free while the production factory passes Keychain.
 */
export interface KeychainAdapter {
  setGenericPassword(username: string, password: string, options?: SetOptions): Promise<unknown>;
  getGenericPassword(options?: GetOptions): Promise<false | { username: string; password: string }>;
  resetGenericPassword(options?: BaseOptions): Promise<boolean>;
}

export type KeychainSecureConnectionStorageOptions = Pick<SetOptions, "securityLevel">;

interface StoredRecord {
  version: typeof RECORD_VERSION;
  token: string;
  connection: PairedConnection | null;
}

function validateConnection(value: unknown): PairedConnection {
  if (!value || typeof value !== "object") throw new Error("stored connection is malformed");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.baseUrl !== "string") throw new Error("stored connection is malformed");
  const connection: PairedConnection = { baseUrl: validateBaseUrl(candidate.baseUrl) };
  if (candidate.deviceId !== undefined) {
    if (typeof candidate.deviceId !== "string" || !candidate.deviceId || candidate.deviceId.length > 256) {
      throw new Error("stored connection is malformed");
    }
    connection.deviceId = candidate.deviceId;
  }
  return connection;
}

function validateRecord(value: unknown): StoredRecord {
  if (!value || typeof value !== "object") throw new Error("stored connection is malformed");
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== RECORD_VERSION) throw new Error("stored connection is malformed");
  assertTokenShape(candidate.token);
  return {
    version: RECORD_VERSION,
    token: candidate.token,
    connection: candidate.connection === null ? null : validateConnection(candidate.connection),
  };
}

export class KeychainSecureConnectionStorage implements SecureConnectionStorage {
  private readonly readOptions = { service: CONNECTION_STORAGE_SERVICE } as const;
  private readonly writeOptions: SetOptions;
  private readonly keychain: KeychainAdapter;

  constructor(keychain: KeychainAdapter, options: KeychainSecureConnectionStorageOptions = {}) {
    this.keychain = keychain;
    this.writeOptions = { ...this.readOptions, ...options };
  }

  async readToken(): Promise<string | null> {
    const record = await this.readRecord();
    return record?.token ?? null;
  }

  async writeToken(token: string): Promise<void> {
    assertTokenShape(token);
    const current = await this.readRecord();
    if (current) {
      await this.writeRecord({ ...current, token });
      return;
    }
    // A token may be received before the address is committed. Keep the
    // record private and coherent; writeConnection completes it afterward.
    await this.writeRaw({ version: RECORD_VERSION, token, connection: null });
  }

  async clearToken(): Promise<void> {
    await this.clearConnection();
  }

  async readConnection(): Promise<PairedConnection | null> {
    const record = await this.readRecord();
    return record?.connection ?? null;
  }

  async writeConnection(connection: PairedConnection): Promise<void> {
    const validated = validateConnection(connection);
    const current = await this.readRecord();
    if (!current) throw new Error("a device token must be stored before the connection");
    await this.writeRecord({ ...current, connection: validated });
  }

  async writePairedConnection(token: string, connection: PairedConnection): Promise<void> {
    assertTokenShape(token);
    const validated = validateConnection(connection);
    await this.writeRecord({ version: RECORD_VERSION, token, connection: validated });
  }

  async clearConnection(): Promise<void> {
    await this.keychain.resetGenericPassword(this.readOptions);
  }

  private async readRecord(): Promise<StoredRecord | null> {
    const credentials = await this.keychain.getGenericPassword(this.readOptions);
    if (!credentials) return null;
    try {
      if (credentials.username !== STORAGE_USERNAME || typeof credentials.password !== "string") throw new Error("malformed");
      const parsed: unknown = JSON.parse(credentials.password);
      return validateRecord(parsed);
    } catch {
      await this.clearConnection();
      return null;
    }
  }

  private async writeRecord(record: StoredRecord): Promise<void> {
    await this.writeRaw(record);
  }

  private async writeRaw(record: unknown): Promise<void> {
    const result = await this.keychain.setGenericPassword(
      STORAGE_USERNAME,
      JSON.stringify(record),
      this.writeOptions,
    );
    if (result === false) throw new Error("secure connection storage could not be written");
  }
}
