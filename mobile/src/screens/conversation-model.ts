import type { Bot, Message } from "@bloks/core/contracts";

export interface ConversationTarget {
  botId: string;
  taskId: string;
  threadId: string;
}

/** Resolve only the lane whose identity was captured when the screen opened. */
export function resolveConversationBot(
  bots: readonly Bot[],
  target: ConversationTarget,
): Bot | null {
  const bot = bots.find((candidate) => candidate.id === target.botId);
  if (!bot || bot.threadId !== target.threadId) return null;
  return (bot.activeTaskId ?? bot.threadId) === target.taskId ? bot : null;
}

export type ConversationRowKind = "text" | "notice" | "activity" | "fallback";

export interface ConversationRow {
  id: string;
  kind: ConversationRowKind;
  role: Message["role"];
  text: string;
  queued: boolean;
  deleted: boolean;
  message: Message;
}

const RENDERED_KINDS = new Set<string>(["text", "notice", "activity"]);
function renderedKind(kind: string): kind is Exclude<ConversationRowKind, "fallback"> {
  return RENDERED_KINDS.has(kind);
}

function activityText(message: Message): string {
  if (typeof message.text === "string" && message.text) return message.text;
  const toolName = message.tool?.name?.trim().slice(0, 128);
  if (toolName) {
    const outcome = message.tool?.ok === true ? " (completed)" : message.tool?.ok === false ? " (failed)" : "";
    return `Activity: ${toolName}${outcome}`;
  }
  return "Activity";
}

/**
 * Convert the settled server transcript into the small row model rendered by
 * native UI. Rich web-only message kinds are intentionally not interpreted on
 * Android yet; they are ignored here and can use fallbackMessageText when a
 * caller needs a safe explanatory label. Malformed/empty records are ignored.
 */
export function settledTranscript(messages: readonly Message[]): ConversationRow[] {
  return messages.flatMap((message) => {
    if (!message.id || !renderedKind(message.kind)) return [];
    const text = message.kind === "activity" ? activityText(message) : typeof message.text === "string" ? message.text : "";
    if (!text && message.kind !== "activity") return [];
    return [{
      id: message.id,
      kind: message.kind,
      role: message.role,
      text,
      queued: message.queued === true,
      deleted: message.deleted === true,
      message,
    } satisfies ConversationRow];
  });
}

/** A conservative preview for unsupported message records. */
export function fallbackMessageText(message: {kind: string; text?: unknown}): string | null {
  if (renderedKind(message.kind)) return null;
  return typeof message.text === "string" && message.text.trim()
    ? "This message type is not available on Android yet."
    : null;
}
