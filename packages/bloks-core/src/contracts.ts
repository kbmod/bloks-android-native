/**
 * Client-safe wire contracts shared by the web and native clients.
 *
 * These deliberately describe what the harness sends to a client, not the
 * provider/session records kept on the computer. Unknown JSON fields must be
 * ignored by consumers so an older client can talk to a newer harness.
 */

export type BlokColor =
  | "green"
  | "blue"
  | "red"
  | "orange"
  | "purple"
  | "cyan"
  | "pink"
  | "yellow"
  | "teal"
  | "coral";

export type BlokShape = "star" | "burst" | "diamond" | "bit" | "triangle" | "cloud" | "drop" | "invader";

export type BlokExpression =
  | "deadpan"
  | "friendly"
  | "focused"
  | "thinking"
  | "excited"
  | "sleepy"
  | "surprised"
  | "skeptical"
  | "worried"
  | "mischievous";

export interface TeamPlan {
  room: string;
  brief: string;
  members: Array<{ name: string; title: string; description: string; skills: string[] }>;
}

export interface OptionCardData {
  title: string;
  subtitle: string;
  options: string[];
  answered?: string;
  dismissed?: boolean;
  requestId?: string;
  tool?: string;
  runId?: string;
  team?: TeamPlan;
}

export interface Message {
  id: string;
  role: "bot" | "user";
  from?: string;
  kind: "text" | "options" | "activity" | "screen" | "notice" | "artifact" | "connector" | "secret" | "component";
  text?: string;
  card?: OptionCardData;
  component?: Record<string, unknown>;
  tool?: { name: string; ok?: boolean };
  png?: string;
  mime?: string;
  replyTo?: { id?: string; author: string; excerpt: string };
  artifact?: { name: string; mime: string; size: number };
  queued?: boolean;
  editedAt?: number;
  deleted?: boolean;
  reactions?: Record<string, string[]>;
  decisionChoice?: number;
  secret?: {
    envName: string;
    label: string;
    hint?: string;
    status: "needs-value" | "saved" | "dismissed";
    resumeKey?: string;
    resumed?: boolean;
  };
  connector?: {
    slug: string;
    label: string;
    status: "needs-auth" | "authorizing" | "connected" | "failed" | "dismissed";
    authUrl?: string;
    resumeKey?: string;
    resumed?: boolean;
    error?: string;
  };
  at: number;
}

export interface ModelSelection {
  instanceId: string;
  model: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  state: "working" | "needs-you" | "idle";
  createdAt: number;
  usage?: { input: number; output: number; turns: number };
  context?: { used: number; limit: number; fraction: number; summarised: boolean };
}

export interface Bot {
  id: string;
  threadId: string;
  name: string;
  title: string;
  description: string;
  notifications: boolean;
  color: BlokColor;
  shape?: BlokShape;
  skills?: string[];
  skillIds?: string[];
  seniority?: number;
  effort?: "low" | "medium" | "high";
  mascotExpression?: BlokExpression | null;
  avatarAt?: number | null;
  unread: boolean;
  busy?: boolean;
  held?: { since: number; why: string; turnedAway: number } | null;
  archivedAt?: number | null;
  tasks?: TaskSummary[];
  activeTaskId?: string;
  modelSelection: ModelSelection;
  computer?: "cloud" | "sandbox" | "local" | "off" | null;
  cwd?: string | null;
  composio?: boolean;
  browser?: boolean;
  mcpServers?: string[];
  voice?: { provider: "elevenlabs" | "openai"; id: string; name?: string } | null;
  speakReplies?: boolean;
  fingerprint?: string;
  withoutComponents?: string[];
  pinned?: boolean;
  section?: string | null;
  approvals?: "ask" | "edits" | "auto";
  hidden?: boolean;
  messages: Message[];
}

export interface Blok {
  id: string;
  name: string;
  memberIds: string[];
  leadOnly?: boolean;
  cwd?: string;
  pinnedCwd?: string | null;
  section?: string | null;
  createdAt: number;
  messages: Message[];
}

export interface InstanceInfo {
  instanceId: string;
  driverKind: string;
  displayName: string;
  snapshot: {
    state: "available" | "unavailable";
    reason?: string;
    authenticated?: boolean;
    version?: string | null;
  };
  models: { default: string; options: Array<{ id: string; label: string }> };
}

export interface ProviderRow {
  kind: string;
  name: string;
  auth: "oauth" | "key" | "cli" | "none";
  keyHint: string;
  signInHint?: string;
  keyPrefix?: string;
  docsUrl: string;
  connected: boolean;
  needsSignIn?: boolean;
  agentic: boolean;
}

export interface ConfigStatus {
  setupDone?: boolean;
  xai?: { configured: boolean };
  composio: { configured: boolean; apiKeyConfigured?: boolean };
  box: { configured: boolean };
  profile?: { about: string };
  compaction?: { micro: boolean };
  skills?: { propose: boolean };
}

export interface PairingStatus {
  enabled: boolean;
  listening: "network" | "loopback";
  restartRequired: boolean;
  pending: boolean;
  devices: Array<{ id: string; name: string; pairedAt: number; lastSeen?: number }>;
  addresses: string[];
}

export interface PairingStart {
  code: string;
  token: string;
  expiresAt: number;
  addresses: string[];
  port: number;
}

export interface PairingClaim {
  token: string;
  device: { id: string; name: string; pairedAt: number };
}

export interface ApiErrorBody {
  error?: string;
}
