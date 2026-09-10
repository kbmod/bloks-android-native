import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveEventTransport, type IncrementalXhr, type LiveEventTransportStatus, type TransportTimers } from "./live-event-transport.ts";

class FakeXhr implements IncrementalXhr {
  responseText = "";
  status = 0;
  readyState = 0;
  method = "";
  url = "";
  aborted = false;
  readonly headers: Record<string, string> = {};
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  send() {}

  abort() {
    this.aborted = true;
  }

  respond(status: number) {
    this.status = status;
    this.readyState = 2;
    this.onreadystatechange?.();
  }

  append(chunk: string) {
    this.responseText += chunk;
    this.onprogress?.();
  }

  fail(status = 0) {
    this.status = status;
    this.onerror?.();
  }
}

class FakeTimers implements TransportTimers {
  pending: Array<{ callback: () => void; delayMs: number }> = [];

  setTimeout(callback: () => void, delayMs: number) {
    this.pending.push({ callback, delayMs });
    return this.pending.length - 1;
  }

  clearTimeout(handle: unknown) {
    this.pending[Number(handle)] = { callback: () => {}, delayMs: -1 };
  }

  fireNext() {
    const next = this.pending.shift();
    next?.callback();
  }
}

test("transport emits each fragmented SSE payload once and ignores keepalives", async () => {
  const xhr = new FakeXhr();
  const data: string[] = [];
  const transport = new LiveEventTransport({ token: "secret", path: "/api/events", xhrFactory: () => xhr, onData: (value) => data.push(value) });
  transport.start();
  await Promise.resolve();
  xhr.respond(200);
  xhr.append(": keepalive\n\ndata: {\"kind\":\"hel");
  xhr.append("lo\"}\n\n");
  assert.deepEqual(data, ['{"kind":"hello"}']);
  assert.equal(xhr.headers.authorization, "Bearer secret");
});

test("transport reconnects with a fresh cursor path and bearer header", async () => {
  const timers = new FakeTimers();
  const requests: FakeXhr[] = [];
  const statuses: LiveEventTransportStatus[] = [];
  let cursor = 1;
  const transport = new LiveEventTransport({
    token: () => "new-token",
    path: () => `/api/events?since=${cursor++}`,
    xhrFactory: () => {
      const xhr = new FakeXhr();
      requests.push(xhr);
      return xhr;
    },
    timers,
    random: () => 0,
    minReconnectMs: 25,
    onData: () => {},
    onStatus: (status) => statuses.push(status),
  });
  transport.start();
  await Promise.resolve();
  assert.equal(requests[0].url, "/api/events?since=1");
  requests[0].fail();
  assert.deepEqual(timers.pending.map((item) => item.delayMs), [25]);
  timers.fireNext();
  await Promise.resolve();
  assert.equal(requests[1].url, "/api/events?since=2");
  assert.equal(requests[1].headers.authorization, "Bearer new-token");
  assert.ok(statuses.some((status) => status.kind === "unreachable"));
  assert.ok(statuses.some((status) => status.kind === "reconnecting"));
});

test("stop aborts the stream and cancels reconnect without reopening", async () => {
  const timers = new FakeTimers();
  const xhr = new FakeXhr();
  const statuses: LiveEventTransportStatus[] = [];
  const transport = new LiveEventTransport({ token: null, path: "/api/events", xhrFactory: () => xhr, timers, onData: () => {}, onStatus: (status) => statuses.push(status) });
  transport.start();
  await Promise.resolve();
  xhr.fail();
  transport.stop();
  assert.equal(xhr.aborted, true);
  timers.fireNext();
  assert.equal(statuses.at(-1)?.kind, "stopped");
});

test("401/403 ends the transport as unauthorized without scheduling a retry", async () => {
  const timers = new FakeTimers();
  const xhr = new FakeXhr();
  const statuses: LiveEventTransportStatus[] = [];
  const transport = new LiveEventTransport({ token: "expired", path: "/api/events", xhrFactory: () => xhr, timers, onData: () => {}, onStatus: (status) => statuses.push(status) });
  transport.start();
  await Promise.resolve();
  xhr.respond(401);
  assert.equal(xhr.aborted, true);
  assert.equal(timers.pending.length, 0);
  assert.deepEqual(statuses.at(-1), { kind: "unauthorized", status: 401 });
});
