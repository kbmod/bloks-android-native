// Pure state: the types every part of the app shares, and the reducer
// that folds actions into them.
//
// This is deliberately a plain .ts module with no React in it. The
// reducer is the piece with real logic (message routing between rooms
// and agents, card patching, arrivals of agents nobody has seen yet), so
// it should be testable without mounting anything. store.tsx owns the
// transports and wires this up.
import type {
  Blok, Bot, ConfigStatus,
  InstanceInfo, Message, ModelSelection, NewAgentProfile, OptionCardData,
  ProviderRow,
} from "./contracts.ts";

export type { BlokColor, BlokShape } from "./contracts.ts";
export type {
  Blok, Bot, ConfigStatus, InstanceInfo, Message, ModelSelection,
  NewAgentProfile, OptionCardData, ProviderRow, Skill, TaskSummary, TeamPlan,
} from "./contracts.ts";

export interface AppState {
  bots: Bot[];
  bloks: Blok[];
  instances: InstanceInfo[];
  providers: ProviderRow[];
  config: ConfigStatus | null;
  selectedId: string;
  settingsOpen: boolean;
  pluginsOpen: boolean;
  computerOpen: boolean;
  appSettingsOpen: boolean;
  newAgentOpen: boolean;
  /** the new-agent screen is the last step of setup, not a normal visit */
  newAgentFirstRun: boolean;
  skillsOpen: boolean;
  routinesOpen: boolean;
  newRoomOpen: boolean;
  projectsOpen: boolean;
  /** The one place that says what is running and what wants you. */
  activityOpen: boolean;
  /** The project the app is looking through, or null for everything.
   * A lens: nothing is hidden from anywhere else, and leaving puts the
   * whole workspace back. */
  projectId: string | null;
  /** in-flight assistant text per threadId (content.delta fold) */
  streaming: Record<string, string>;
  /** the most recent picture of each agent's screen */
  screens: Record<string, { png: string; mime: string }>;
  /** agents whose box is still being stood up, so the panel can say so */
  provisioning: Record<string, boolean>;
  connected: boolean;
  error: string | null;
}

export type Action =
  | { type: "hydrate"; bots: Bot[] }
  | { type: "hydrateBloks"; bloks: Blok[] }
  | { type: "blokPatched"; blok: Omit<Blok, "messages"> }
  | { type: "blokDeleted"; blokId: string }
  | { type: "createRoom"; name: string; memberIds: string[] }
  | { type: "deleteRoom"; blokId: string }
  | { type: "patchRoom"; blokId: string; patch: { archived?: boolean; name?: string; section?: string | null } }
  | { type: "sendToRoom"; blokId: string; text: string; replyTo?: Message["replyTo"] }
  | { type: "toggleNewRoom"; open?: boolean }
  | { type: "instances"; instances: InstanceInfo[] }
  | { type: "providers"; providers: ProviderRow[] }
  | { type: "connectProvider"; kind: string; key?: string; url?: string }
  | { type: "disconnectProvider"; kind: string }
  | { type: "configStatus"; config: ConfigStatus }
  | { type: "select"; id: string }
  | { type: "send"; botId: string; text: string; replyTo?: Message["replyTo"] }
  | { type: "answerCard"; botId: string; messageId: string; answer: string; roomId?: string }
  | { type: "dismissCard"; botId: string; messageId: string; roomId?: string }
  | { type: "hireTeam"; botId: string; messageId: string }
  | { type: "newBot"; profile?: NewAgentProfile }
  | { type: "toggleNewAgent"; open?: boolean; firstRun?: boolean }
  | { type: "toggleSkills"; open?: boolean }
  | { type: "toggleRoutines"; open?: boolean }
  | { type: "toggleActivity"; open?: boolean }
  | { type: "newTask"; botId: string }
  | { type: "selectTask"; botId: string; taskId: string }
  | { type: "closeTask"; botId: string; taskId: string }
  | { type: "botAdded"; bot: Bot }
  | { type: "deleteBot"; botId: string; forget?: boolean }
  | { type: "restoreBot"; botId: string }
  | { type: "duplicateBot"; botId: string }
  | { type: "markUnread"; botId: string }
  | { type: "botPatched"; bot: Partial<Bot> & { id: string } }
  | { type: "messageAdded"; threadId: string; message: Message }
  | { type: "messagePatched"; threadId: string; message: Message }
  | { type: "streamDelta"; threadId: string; delta: string }
  | { type: "streamClear"; threadId: string }
  | { type: "screenFrame"; botId: string; png: string; mime: string }
  | { type: "provisioning"; botId: string; on: boolean }
  | { type: "setModel"; botId: string; selection: ModelSelection }
  | { type: "interrupt"; botId: string }
  | { type: "connected"; value: boolean }
  | { type: "error"; message: string | null }
  | { type: "toggleSettings"; open?: boolean }
  | { type: "togglePlugins"; open?: boolean }
  | { type: "toggleComputer"; open?: boolean }
  | { type: "toggleAppSettings"; open?: boolean }
  | { type: "toggleProjects"; open?: boolean }
  | { type: "openProject"; id: string | null }
  | {
      type: "updateBot";
      botId: string;
      patch: Partial<
        Pick<
          Bot,
          | "name"
          | "title"
          | "description"
          | "notifications"
          | "computer"
          | "color"
          | "shape"
          | "skills"
          | "skillIds"
          | "seniority"
          | "effort"
          | "mascotExpression"
          | "pinned"
          | "hidden"
          | "section"
          | "approvals"
          | "composio"
          | "mcpServers"
        >
      >;
    };

function updateBot(state: AppState, botId: string, fn: (b: Bot) => Bot): AppState {
  return { ...state, bots: state.bots.map((b) => (b.id === botId ? fn(b) : b)) };
}

/** The card a card action is about, in an agent's chat or in a room. */
export function findCard(
  state: AppState,
  ref: { botId: string; messageId: string; roomId?: string },
): OptionCardData | undefined {
  const messages = ref.roomId
    ? state.bloks.find((b) => b.id === ref.roomId)?.messages
    : state.bots.find((b) => b.id === ref.botId)?.messages;
  return messages?.find((m) => m.id === ref.messageId)?.card;
}

const withCard = (messages: Message[], messageId: string, patch: Partial<OptionCardData>) =>
  messages.map((m) => (m.id === messageId && m.card ? { ...m, card: { ...m.card, ...patch } } : m));

/** Cards live in an agent's chat or in a room; roomId picks which. */
function patchCard(
  state: AppState,
  botId: string,
  messageId: string,
  patch: Partial<OptionCardData>,
  roomId?: string,
): AppState {
  if (roomId) {
    return {
      ...state,
      bloks: state.bloks.map((b) =>
        b.id === roomId ? { ...b, messages: withCard(b.messages, messageId, patch) } : b,
      ),
    };
  }
  return updateBot(state, botId, (b) => ({ ...b, messages: withCard(b.messages, messageId, patch) }));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate": {
      const wanted = state.selectedId;
      const match = action.bots.find((b) => b.id === wanted);
      const selectedId = match
        ? match.hidden
          ? (action.bots.find((b) => !b.hidden)?.id ?? "")
          : wanted
        : wanted && !action.bots.some((b) => b.id === wanted)
          ? wanted
          : (action.bots.find((b) => !b.hidden)?.id ?? "");
      return { ...state, bots: action.bots, selectedId };
    }
    case "hydrateBloks": {
      const wanted = state.selectedId;
      const selectedId = action.bloks.some((b) => b.id === wanted) ? wanted : state.selectedId;
      return { ...state, bloks: action.bloks, selectedId };
    }
    case "blokPatched": {
      const existing = state.bloks.find((b) => b.id === action.blok.id);
      return {
        ...state,
        bloks: existing
          ? state.bloks.map((b) => (b.id === action.blok.id ? { ...b, ...action.blok } : b))
          : [{ ...action.blok, messages: [] }, ...state.bloks],
      };
    }
    case "blokDeleted": {
      const bloks = state.bloks.filter((b) => b.id !== action.blokId);
      const selectedId =
        state.selectedId === action.blokId ? (state.bots[0]?.id ?? "") : state.selectedId;
      return { ...state, bloks, selectedId };
    }
    case "toggleNewRoom":
      return { ...state, newRoomOpen: action.open ?? !state.newRoomOpen };
    case "toggleProjects":
      return { ...state, projectsOpen: action.open ?? !state.projectsOpen };
    case "openProject": {
      return { ...state, projectId: action.id };
    }
    case "instances":
      return { ...state, instances: action.instances };
    case "providers":
      return { ...state, providers: action.providers };
    case "configStatus":
      return { ...state, config: action.config };
    case "select":
      return updateBot({ ...state, selectedId: action.id }, action.id, (b) => ({ ...b, unread: false }));
    // settle the card locally now; the server's own patch arrives a
    // moment later saying the same thing
    case "answerCard":
      return patchCard(state, action.botId, action.messageId, { answered: action.answer }, action.roomId);
    case "dismissCard":
      return patchCard(state, action.botId, action.messageId, { dismissed: true }, action.roomId);
    case "hireTeam":
      return patchCard(state, action.botId, action.messageId, { answered: "Hire the team" });
    case "botAdded":
      return {
        ...state,
        bots: [action.bot, ...state.bots],
        selectedId: action.bot.id,
        newAgentOpen: false,
        newAgentFirstRun: false,
      };
    case "toggleNewAgent":
      return {
        ...state,
        newAgentOpen: action.open ?? !state.newAgentOpen,
        // only a deliberate first-run open sets the flag; every close clears
        // it, so a later visit never inherits setup's copy
        newAgentFirstRun: (action.open ?? !state.newAgentOpen) ? (action.firstRun ?? false) : false,
      };
    case "toggleSkills":
      return { ...state, skillsOpen: action.open ?? !state.skillsOpen };
    case "toggleRoutines":
      return { ...state, routinesOpen: action.open ?? !state.routinesOpen };
    case "toggleActivity":
      return { ...state, activityOpen: action.open ?? !state.activityOpen };
    case "newTask":
    case "selectTask":
    case "closeTask":
      return state;
    case "deleteBot": {
      // Archiving keeps the record, so it must keep the transcript in the
      // client too. Dropping the row and waiting for the bot frame to put
      // it back would put it back empty: clientBot carries no messages,
      // and the arrival branch below seeds a new row with none. The row
      // moves to the drawer instead, with everything it had.
      if (!action.forget) {
        const moved = state.bots.map((b) =>
          b.id === action.botId ? { ...b, hidden: true, archivedAt: Date.now() } : b,
        );
        const selectedId =
          state.selectedId === action.botId ? (moved.find((b) => !b.hidden)?.id ?? "") : state.selectedId;
        return { ...state, bots: moved, selectedId };
      }
      const bots = state.bots.filter((b) => b.id !== action.botId);
      const selectedId =
        state.selectedId === action.botId ? (bots.find((b) => !b.hidden)?.id ?? "") : state.selectedId;
      return { ...state, bots, selectedId };
    }
    case "restoreBot":
      // Optimistic, and corrected by the bot frame that follows. Waiting
      // for the round trip leaves the row in the drawer for a beat after
      // the press, which reads as the button not working.
      return updateBot(state, action.botId, (b) => ({ ...b, hidden: false, archivedAt: null }));
    case "markUnread":
      return updateBot(state, action.botId, (b) => ({ ...b, unread: true }));
    case "botPatched": {
      // A whole record for an agent we have never seen is a new agent, not
      // a patch: an agent a lead just hired shows up this way.
      const known = state.bots.some((b) => b.id === action.bot.id);
      if (!known) {
        const arrival = action.bot as Partial<Bot> & { id: string; threadId?: string };
        if (!arrival.threadId) return state;
        return { ...state, bots: [{ messages: [], ...arrival } as Bot, ...state.bots] };
      }
      return updateBot(state, action.bot.id, (b) => ({
        ...b,
        ...action.bot,
        messages: (action.bot as Partial<Bot>).messages ?? b.messages,
      }));
    }
    case "messageAdded": {
      const room = state.bloks.find((b) => b.id === action.threadId);
      if (room) {
        return {
          ...state,
          bloks: state.bloks.map((b) =>
            b.id === room.id && !b.messages.some((m) => m.id === action.message.id)
              ? { ...b, messages: [...b.messages, action.message] }
              : b,
          ),
        };
      }
      const bot = state.bots.find((b) => b.threadId === action.threadId);
      if (!bot) return state;
      const next = updateBot(state, bot.id, (b) =>
        b.messages.some((m) => m.id === action.message.id)
          ? b
          : { ...b, messages: [...b.messages, action.message] },
      );
      // the reply has landed as a real message, so the streaming preview
    // for that thread has done its job
      if (action.message.role === "bot" && action.message.kind === "text") {
        const { [action.threadId]: _, ...rest } = next.streaming;
        return { ...next, streaming: rest };
      }
      return next;
    }
    case "messagePatched": {
      const room = state.bloks.find((b) => b.id === action.threadId);
      if (room) {
        return {
          ...state,
          bloks: state.bloks.map((b) =>
            b.id === room.id
              ? { ...b, messages: b.messages.map((m) => (m.id === action.message.id ? action.message : m)) }
              : b,
          ),
        };
      }
      const bot = state.bots.find((b) => b.threadId === action.threadId);
      if (!bot) return state;
      return updateBot(state, bot.id, (b) => ({
        ...b,
        messages: b.messages.map((m) => (m.id === action.message.id ? action.message : m)),
      }));
    }
    case "streamDelta":
      return {
        ...state,
        streaming: {
          ...state.streaming,
          [action.threadId]: (state.streaming[action.threadId] ?? "") + action.delta,
        },
      };
    case "streamClear": {
      const { [action.threadId]: _, ...rest } = state.streaming;
      return { ...state, streaming: rest };
    }
    case "screenFrame":
      return {
        ...state,
        screens: { ...state.screens, [action.botId]: { png: action.png, mime: action.mime } },
        provisioning: { ...state.provisioning, [action.botId]: false },
      };
    case "provisioning":
      return { ...state, provisioning: { ...state.provisioning, [action.botId]: action.on } };
    case "setModel":
      return updateBot(state, action.botId, (b) => ({ ...b, modelSelection: action.selection }));
    case "connected":
      return { ...state, connected: action.value };
    case "error":
      return { ...state, error: action.message };
    // the right-hand slot holds one thing at a time, so opening any of
    // these closes the rest
    case "toggleSettings": {
      const open = action.open ?? !state.settingsOpen;
      return {
        ...state,
        settingsOpen: open,
        computerOpen: open ? false : state.computerOpen,
        appSettingsOpen: open ? false : state.appSettingsOpen,
      };
    }
    case "togglePlugins":
      return { ...state, pluginsOpen: action.open ?? !state.pluginsOpen };
    case "toggleComputer": {
      const open = action.open ?? !state.computerOpen;
      return {
        ...state,
        computerOpen: open,
        settingsOpen: open ? false : state.settingsOpen,
        appSettingsOpen: open ? false : state.appSettingsOpen,
      };
    }
    case "toggleAppSettings": {
      const open = action.open ?? !state.appSettingsOpen;
      return {
        ...state,
        appSettingsOpen: open,
        settingsOpen: open ? false : state.settingsOpen,
        computerOpen: open ? false : state.computerOpen,
        pluginsOpen: open ? false : state.pluginsOpen,
      };
    }
    case "updateBot":
      return updateBot(state, action.botId, (b) => ({ ...b, ...action.patch }));
    case "patchRoom": {
      // archived rooms leave the list the moment the choice is made; the
      // server confirms on its own broadcast
      const bloks = action.patch.archived
        ? state.bloks.filter((b) => b.id !== action.blokId)
        : state.bloks.map((b) => (b.id === action.blokId ? { ...b, ...action.patch } : b));
      const selectedId =
        action.patch.archived && state.selectedId === action.blokId
          ? (state.bots.find((b) => !b.hidden)?.id ?? "")
          : state.selectedId;
      return { ...state, bloks, selectedId };
    }
    // handled entirely by the async wrapper
    case "createRoom":
    case "deleteRoom":
    case "sendToRoom":
    case "send":
    case "newBot":
    case "duplicateBot":
    case "interrupt":
    case "connectProvider":
    case "disconnectProvider":
      return state;
  }
}

export interface InitialStateOptions {
  selectedId?: string;
  projectId?: string | null;
}

export function createInitialState(options: InitialStateOptions = {}): AppState {
  return {
    bots: [],
    bloks: [],
    instances: [],
    providers: [],
    config: null,
    selectedId: options.selectedId ?? "",
    settingsOpen: false,
    pluginsOpen: false,
    computerOpen: false,
    appSettingsOpen: false,
    newAgentOpen: false,
    newAgentFirstRun: false,
    skillsOpen: false,
    routinesOpen: false,
    newRoomOpen: false,
    projectsOpen: false,
    activityOpen: false,
    projectId: options.projectId ?? null,
    streaming: {},
    screens: {},
    provisioning: {},
    connected: false,
    error: null,
  };
}

export const initialState: AppState = createInitialState();
