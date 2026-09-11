import type { Message } from "@bloks/core/contracts";
import { ApiError, type ApiClient } from "./api.ts";

export interface SendBotMessageResponse {
  [key: string]: unknown;
}

export type CommandFailureKind = "rejected" | "unknown";

/** Network/timeout failures may follow a server-side acceptance. */
export function commandFailureKind(error: unknown): CommandFailureKind {
  return error instanceof ApiError ? "rejected" : "unknown";
}

/**
 * Send one agent message through the authenticated client. The command owns
 * the input boundary: whitespace is removed before it reaches the server and
 * an empty composer cannot accidentally create a turn.
 */
export function sendBotMessage(
  client: Pick<ApiClient, "post">,
  botId: string,
  text: string,
  taskId: string,
  replyTo?: Message["replyTo"],
): Promise<SendBotMessageResponse> {
  const trimmed = text.trim();
  if (!trimmed) return Promise.reject(new Error("Message cannot be empty"));
  return client.post<SendBotMessageResponse>(
    `/api/bots/${encodeURIComponent(botId)}/messages`,
    replyTo ? {text: trimmed, taskId, replyTo} : {text: trimmed, taskId},
  );
}

/** Interrupt the captured task, without changing local busy state. */
export function interruptBot(
  client: Pick<ApiClient, "post">,
  botId: string,
  taskId: string,
): Promise<unknown> {
  return client.post(
    `/api/bots/${encodeURIComponent(botId)}/interrupt`,
    {taskId},
  );
}
