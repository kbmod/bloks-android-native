import { apiPaths } from "@bloks/core/api";
import type {
  Blok,
  Bot,
  ConfigStatus,
  InstanceInfo,
  Message,
  ProviderRow,
} from "@bloks/core/contracts";

/** The small part of ApiClient used by hydration, kept injectable for tests. */
export interface HydrationClient {
  get<T>(path: string): Promise<T>;
}

export interface MobileHydratedWorkspace {
  bots: Bot[];
  bloks: Blok[];
  instances: InstanceInfo[];
  providers: ProviderRow[];
  config: ConfigStatus | null;
}

type JsonObject = Record<string, unknown>;

const MESSAGE_KINDS = new Set<Message["kind"]>([
  "text",
  "options",
  "activity",
  "screen",
  "notice",
  "artifact",
  "connector",
  "secret",
  "component",
]);
const ROLES = new Set<Message["role"]>(["bot", "user"]);
const COLORS = new Set<Bot["color"]>([
  "green",
  "blue",
  "red",
  "orange",
  "purple",
  "cyan",
  "pink",
  "yellow",
  "teal",
  "coral",
]);

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function identifier(value: unknown): value is string {
  return string(value) && value.trim().length > 0 && value.length <= 512;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(string) : [];
}

/**
 * Keep server extensions by spreading the source object, but repair/drop
 * malformed known fields before they reach the shared reducer.
 */
export function normalizeMessage(value: unknown): Message | null {
  const source = object(value);
  if (!source || !identifier(source.id) || !ROLES.has(source.role as Message["role"]) ||
      !MESSAGE_KINDS.has(source.kind as Message["kind"]) || !finite(source.at)) return null;
  const {
    id: _id, role: _role, kind: _kind, at: _at,
    from: _from, text: _text, card: _card, component: _component, tool: _tool,
    png: _png, mime: _mime, replyTo: _replyTo, artifact: _artifact,
    queued: _queued, editedAt: _editedAt, deleted: _deleted, reactions: _reactions,
    decisionChoice: _decisionChoice, secret: _secret, connector: _connector,
    ...extensions
  } = source;
  const message: Message = {
    ...extensions,
    id: source.id,
    role: source.role as Message["role"],
    kind: source.kind as Message["kind"],
    at: source.at,
  };
  if (string(source.from)) message.from = source.from;
  if (string(source.text)) message.text = source.text;
  const card = object(source.card);
  if (card && string(card.title) && string(card.subtitle) && Array.isArray(card.options) && card.options.every(string)) {
    message.card = {
      title: card.title,
      subtitle: card.subtitle,
      options: card.options,
      ...(string(card.answered) ? { answered: card.answered } : {}),
      ...(typeof card.dismissed === "boolean" ? { dismissed: card.dismissed } : {}),
      ...(string(card.requestId) ? { requestId: card.requestId } : {}),
      ...(string(card.tool) ? { tool: card.tool } : {}),
      ...(string(card.runId) ? { runId: card.runId } : {}),
    };
  }
  const component = object(source.component);
  if (component) message.component = component;
  const tool = object(source.tool);
  if (tool && string(tool.name)) message.tool = { name: tool.name, ...(typeof tool.ok === "boolean" ? { ok: tool.ok } : {}) };
  if (string(source.png)) message.png = source.png;
  if (string(source.mime)) message.mime = source.mime;
  const replyTo = object(source.replyTo);
  if (replyTo && string(replyTo.author) && string(replyTo.excerpt)) {
    message.replyTo = {
      ...(string(replyTo.id) ? { id: replyTo.id } : {}),
      author: replyTo.author,
      excerpt: replyTo.excerpt,
    };
  }
  const artifact = object(source.artifact);
  if (artifact && string(artifact.name) && string(artifact.mime) && finite(artifact.size)) {
    message.artifact = { name: artifact.name, mime: artifact.mime, size: artifact.size };
  }
  if (typeof source.queued === "boolean") message.queued = source.queued;
  if (finite(source.editedAt)) message.editedAt = source.editedAt;
  if (typeof source.deleted === "boolean") message.deleted = source.deleted;
  const reactions = object(source.reactions);
  if (reactions) {
    const cleanReactions: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(reactions)) {
      if (Array.isArray(values) && values.every(string)) cleanReactions[key] = values;
    }
    message.reactions = cleanReactions;
  }
  if (typeof source.decisionChoice === "number" && Number.isInteger(source.decisionChoice)) {
    message.decisionChoice = source.decisionChoice;
  }
  const secret = object(source.secret);
  const secretStatuses = new Set(["needs-value", "saved", "dismissed"]);
  if (secret && string(secret.envName) && string(secret.label) && secretStatuses.has(String(secret.status))) {
    message.secret = {
      envName: secret.envName,
      label: secret.label,
      status: secret.status as NonNullable<Message["secret"]>["status"],
      ...(string(secret.hint) ? { hint: secret.hint } : {}),
      ...(string(secret.resumeKey) ? { resumeKey: secret.resumeKey } : {}),
      ...(typeof secret.resumed === "boolean" ? { resumed: secret.resumed } : {}),
    };
  }
  const connector = object(source.connector);
  const connectorStatuses = new Set(["needs-auth", "authorizing", "connected", "failed", "dismissed"]);
  if (connector && string(connector.slug) && string(connector.label) && connectorStatuses.has(String(connector.status))) {
    message.connector = {
      slug: connector.slug,
      label: connector.label,
      status: connector.status as NonNullable<Message["connector"]>["status"],
      ...(string(connector.authUrl) ? { authUrl: connector.authUrl } : {}),
      ...(string(connector.resumeKey) ? { resumeKey: connector.resumeKey } : {}),
      ...(typeof connector.resumed === "boolean" ? { resumed: connector.resumed } : {}),
      ...(string(connector.error) ? { error: connector.error } : {}),
    };
  }
  return message;
}

function normalizeMessages(value: unknown): Message[] {
  return Array.isArray(value)
    ? value.map(normalizeMessage).filter((message): message is Message => message !== null)
    : [];
}

function modelSelection(value: unknown): Bot["modelSelection"] {
  const source = object(value);
  return source && string(source.instanceId) && string(source.model)
    ? { instanceId: source.instanceId, model: source.model }
    : { instanceId: "", model: "" };
}

export function normalizeBot(value: unknown): Bot | null {
  const source = object(value);
  if (!source || !identifier(source.id) || !identifier(source.threadId)) return null;
  const {
    id: _id,
    threadId: _threadId,
    name: _name,
    title: _title,
    description: _description,
    notifications: _notifications,
    color: _color,
    unread: _unread,
    modelSelection: _modelSelection,
    messages: _messages,
    ...extensions
  } = source;
  return {
    ...extensions,
    id: source.id,
    threadId: source.threadId,
    name: string(source.name) ? source.name : source.id,
    title: string(source.title) ? source.title : "",
    description: string(source.description) ? source.description : "",
    notifications: typeof source.notifications === "boolean" ? source.notifications : true,
    color: COLORS.has(source.color as Bot["color"]) ? source.color as Bot["color"] : "blue",
    unread: source.unread === true,
    modelSelection: modelSelection(source.modelSelection),
    messages: normalizeMessages(source.messages),
  } as Bot;
}

/** Normalize a bot event patch while retaining fields unknown to this client. */
export function normalizeBotPatch(value: unknown): (Partial<Bot> & { id: string }) | null {
  const source = object(value);
  if (!source || !identifier(source.id)) return null;
  const {
    id: _id, threadId: _threadId, name: _name, title: _title, description: _description,
    notifications: _notifications, color: _color, shape: _shape, skills: _skills, skillIds: _skillIds,
    seniority: _seniority, effort: _effort, mascotExpression: _mascotExpression, avatarAt: _avatarAt,
    unread: _unread, busy: _busy, held: _held, archivedAt: _archivedAt, tasks: _tasks,
    activeTaskId: _activeTaskId, modelSelection: _modelSelection, computer: _computer, cwd: _cwd,
    composio: _composio, browser: _browser, mcpServers: _mcpServers, voice: _voice,
    speakReplies: _speakReplies, fingerprint: _fingerprint, withoutComponents: _withoutComponents,
    pinned: _pinned, section: _section, approvals: _approvals, hidden: _hidden,
    messages: _messages,
    ...extensions
  } = source;
  const patch: Partial<Bot> & { id: string } = { ...extensions, id: source.id };
  if (identifier(source.threadId)) patch.threadId = source.threadId;
  if (string(source.name)) patch.name = source.name;
  if (string(source.title)) patch.title = source.title;
  if (string(source.description)) patch.description = source.description;
  if (typeof source.notifications === "boolean") patch.notifications = source.notifications;
  if (COLORS.has(source.color as Bot["color"])) patch.color = source.color as Bot["color"];
  if (typeof source.unread === "boolean") patch.unread = source.unread;
  if (typeof source.busy === "boolean") patch.busy = source.busy;
  if (typeof source.composio === "boolean") patch.composio = source.composio;
  if (typeof source.browser === "boolean") patch.browser = source.browser;
  if (typeof source.speakReplies === "boolean") patch.speakReplies = source.speakReplies;
  if (typeof source.pinned === "boolean") patch.pinned = source.pinned;
  if (typeof source.hidden === "boolean") patch.hidden = source.hidden;
  if (finite(source.seniority)) patch.seniority = source.seniority;
  if (finite(source.avatarAt)) patch.avatarAt = source.avatarAt;
  if (finite(source.archivedAt)) patch.archivedAt = source.archivedAt;
  if (string(source.activeTaskId)) patch.activeTaskId = source.activeTaskId;
  if (string(source.cwd)) patch.cwd = source.cwd;
  if (string(source.fingerprint)) patch.fingerprint = source.fingerprint;
  if (Array.isArray(source.skills) && source.skills.every(string)) patch.skills = source.skills;
  if (Array.isArray(source.skillIds) && source.skillIds.every(string)) patch.skillIds = source.skillIds;
  if (Array.isArray(source.mcpServers) && source.mcpServers.every(string)) patch.mcpServers = source.mcpServers;
  if (Array.isArray(source.withoutComponents) && source.withoutComponents.every(string)) patch.withoutComponents = source.withoutComponents;
  if (source.section === null || string(source.section)) patch.section = source.section;
  if (source.computer === null || source.computer === "cloud" || source.computer === "sandbox" || source.computer === "local" || source.computer === "off") patch.computer = source.computer;
  if (source.approvals === "ask" || source.approvals === "edits" || source.approvals === "auto") patch.approvals = source.approvals;
  if (source.effort === "low" || source.effort === "medium" || source.effort === "high") patch.effort = source.effort;
  if (Array.isArray(source.messages)) patch.messages = normalizeMessages(source.messages);
  return patch;
}

export function normalizeBlok(value: unknown): Blok | null {
  const source = object(value);
  if (!source || !identifier(source.id)) return null;
  const { id: _id, name: _name, memberIds: _memberIds, createdAt: _createdAt, messages: _messages, ...extensions } = source;
  return {
    ...extensions,
    id: source.id,
    name: string(source.name) ? source.name : source.id,
    memberIds: strings(source.memberIds),
    createdAt: finite(source.createdAt) ? source.createdAt : 0,
    messages: normalizeMessages(source.messages),
  } as Blok;
}

export function normalizeInstance(value: unknown): InstanceInfo | null {
  const source = object(value);
  const snapshot = object(source?.snapshot);
  const models = object(source?.models);
  if (!source || !identifier(source.instanceId) || !identifier(source.driverKind) || !string(source.displayName)) return null;
  const options = Array.isArray(models?.options)
    ? models.options.map((entry) => {
        const row = object(entry);
        return row && string(row.id) && string(row.label) ? { id: row.id, label: row.label } : null;
      }).filter((entry): entry is { id: string; label: string } => entry !== null)
    : [];
  const { instanceId: _instanceId, driverKind: _driverKind, displayName: _displayName, snapshot: _snapshot, models: _models, ...extensions } = source;
  return {
    ...extensions,
    instanceId: source.instanceId,
    driverKind: source.driverKind,
    displayName: source.displayName,
    snapshot: {
      state: snapshot?.state === "available" ? "available" : "unavailable",
      ...(string(snapshot?.reason) ? { reason: snapshot.reason } : {}),
      ...(typeof snapshot?.authenticated === "boolean" ? { authenticated: snapshot.authenticated } : {}),
      ...(snapshot?.version === null || string(snapshot?.version) ? { version: snapshot.version as string | null } : {}),
    },
    models: { default: string(models?.default) ? models.default : "", options },
  } as InstanceInfo;
}

export function normalizeProvider(value: unknown): ProviderRow | null {
  const source = object(value);
  if (!source || !identifier(source.kind) || !string(source.name)) return null;
  const { kind: _kind, name: _name, auth: _auth, keyHint: _keyHint, docsUrl: _docsUrl, connected: _connected, agentic: _agentic, ...extensions } = source;
  const auth = source.auth === "oauth" || source.auth === "key" || source.auth === "cli" || source.auth === "none"
    ? source.auth
    : "none";
  return {
    ...extensions,
    kind: source.kind,
    name: source.name,
    auth,
    keyHint: string(source.keyHint) ? source.keyHint : "",
    docsUrl: string(source.docsUrl) ? source.docsUrl : "",
    connected: source.connected === true,
    agentic: source.agentic === true,
  } as ProviderRow;
}

export function normalizeConfig(value: unknown): ConfigStatus | null {
  const source = object(value);
  if (!source) return null;
  const composio = object(source.composio);
  const box = object(source.box);
  // Config intentionally keeps extensions such as workspace and shortcuts.
  return {
    ...source,
    ...(typeof source.setupDone === "boolean" ? { setupDone: source.setupDone } : {}),
    composio: { ...(composio ?? {}), configured: composio?.configured === true },
    box: { ...(box ?? {}), configured: box?.configured === true },
  } as ConfigStatus;
}

function arrayFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  const source = object(value);
  return Array.isArray(source?.[key]) ? source[key] : [];
}

/**
 * Parse all five initial endpoints concurrently. Endpoint response envelopes
 * are kept here (rather than in screens) so native callers have one typed,
 * defensive hydration boundary.
 */
export async function hydrateWorkspace(client: HydrationClient): Promise<MobileHydratedWorkspace> {
  const [botsPayload, bloksPayload, instancesPayload, providersPayload, configPayload] = await Promise.all([
    client.get<unknown>(apiPaths.bots),
    client.get<unknown>(apiPaths.bloks),
    client.get<unknown>(apiPaths.instances),
    client.get<unknown>(apiPaths.providers),
    client.get<unknown>(apiPaths.config),
  ]);
  return {
    bots: arrayFrom(botsPayload, "bots").map(normalizeBot).filter((bot): bot is Bot => bot !== null),
    bloks: arrayFrom(bloksPayload, "bloks").map(normalizeBlok).filter((blok): blok is Blok => blok !== null),
    instances: arrayFrom(instancesPayload, "instances").map(normalizeInstance).filter((instance): instance is InstanceInfo => instance !== null),
    providers: arrayFrom(providersPayload, "providers").map(normalizeProvider).filter((provider): provider is ProviderRow => provider !== null),
    config: normalizeConfig(configPayload),
  };
}
