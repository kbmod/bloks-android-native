import type { Blok, Bot, InstanceInfo, Message, ProviderRow } from "./contracts.ts";

export interface HelloFrame {
  kind: "hello";
  _seq?: number;
  resumed?: boolean;
}
export interface MessageFrame {
  kind: "message" | "message.patch";
  _seq?: number;
  threadId: string;
  message: Message;
}
export interface BotFrame {
  kind: "bot";
  _seq?: number;
  bot: Partial<Bot> & { id: string };
}
export interface RuntimeFrame {
  kind: "runtime";
  _seq?: number;
  event: {
    type: string;
    threadId: string;
    streamKind?: string;
    delta?: string;
    requestId?: string;
    [key: string]: unknown;
  };
}
export interface ScreenFrame { kind: "screen"; _seq?: number; botId: string; png: string; mime?: string; }
export interface ComputerFrame { kind: "computer"; _seq?: number; botId: string; state: string; }
export interface BlokFrame { kind: "blok"; _seq?: number; blok: Omit<Blok, "messages"> & { messages?: Message[] }; }
export interface BlokDeletedFrame { kind: "blok.deleted"; _seq?: number; blokId: string; }
export interface ProviderFrame { kind: "providers"; _seq?: number; providers: ProviderRow[]; }
export interface InstanceFrame { kind: "instances"; _seq?: number; instances: InstanceInfo[]; }
export interface ConfigFrame { kind: "config"; _seq?: number; [key: string]: unknown; }
export interface BotDeletedFrame { kind: "bot.deleted"; _seq?: number; botId: string; }

export type EventFrame =
  | HelloFrame | MessageFrame | BotFrame | RuntimeFrame | ScreenFrame | ComputerFrame
  | BlokFrame | BlokDeletedFrame | ProviderFrame | InstanceFrame | ConfigFrame | BotDeletedFrame;

/** Parse one SSE `data:` payload without trusting unknown server fields. */
export function parseEventData(raw: string): EventFrame | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || typeof (value as { kind?: unknown }).kind !== "string") return null;
    return value as EventFrame;
  } catch { return null; }
}

/** Extract complete SSE data payloads from an incrementally received chunk. */
export function parseSseChunk(buffer: string): { frames: EventFrame[]; remainder: string } {
  const frames: EventFrame[] = [];
  let remainder = buffer;
  for (;;) {
    const lfCut = remainder.indexOf("\n\n");
    const crlfCut = remainder.indexOf("\r\n\r\n");
    if (lfCut === -1 && crlfCut === -1) break;
    const useCrlf = crlfCut !== -1 && (lfCut === -1 || crlfCut < lfCut);
    const cut = useCrlf ? crlfCut : lfCut;
    const block = remainder.slice(0, cut);
    remainder = remainder.slice(cut + (useCrlf ? 4 : 2));
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).join("\n");
    if (data) {
      const frame = parseEventData(data);
      if (frame) frames.push(frame);
    }
  }
  return { frames, remainder };
}
