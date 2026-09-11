import React, {useCallback, useMemo, useRef, useState, useSyncExternalStore} from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {createInitialState} from "@bloks/core/reducer";
import type {RootStackParamList} from "../../App";
import {useWorkspaceSession} from "../connection/context";
import {commandFailureKind, interruptBot, sendBotMessage} from "../network/commands";
import type {WorkspaceSessionSnapshot} from "../workspace/session-coordinator";
import {resolveConversationBot, settledTranscript, type ConversationRow} from "./conversation-model";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation">;
const EMPTY_SNAPSHOT: WorkspaceSessionSnapshot = {status: "idle", state: createInitialState()};

export function ConversationScreen({route, navigation}: Props) {
  const session = useWorkspaceSession();
  const subscribe = useCallback((listener: () => void) => session?.subscribe(listener) ?? (() => {}), [session]);
  const getSnapshot = useCallback(() => session?.snapshot ?? EMPTY_SNAPSHOT, [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const botRecord = snapshot.state.bots.find((candidate) => candidate.id === route.params.botId);
  // Bot messages are the currently active lane only. Keep the route bound to
  // the lane captured at roster press; otherwise a live bot patch could make
  // this screen render lane A while commands are sent to lane B.
  const bot = resolveConversationBot(snapshot.state.bots, route.params) ?? undefined;
  const [draft, setDraft] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "rejected" | "unknown">("idle");
  const [uncertainDraft, setUncertainDraft] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const listRef = useRef<FlatList<ConversationRow>>(null);
  const initiallyPositioned = useRef<string | null>(null);
  const rows = useMemo(() => settledTranscript(bot?.messages ?? []), [bot?.messages]);
  const canCommand = session !== null && snapshot.status === "connected" && bot !== undefined;
  const streaming = bot ? snapshot.state.streaming[bot.threadId] : undefined;
  const onContentSizeChange = useCallback(() => {
    if (!bot || rows.length === 0 || initiallyPositioned.current === bot.id) return;
    initiallyPositioned.current = bot.id;
    listRef.current?.scrollToEnd({animated: false});
  }, [bot, rows.length]);

  async function onSend() {
    if (!canCommand || !session || !bot || sendState === "sending") return;
    const text = draft.trim();
    if (!text) return;
    // A timeout or transport failure may have happened after the server
    // accepted the turn. Do not provide a one-tap duplicate submission.
    if (sendState === "unknown" && uncertainDraft === text) return;
    setSendState("sending");
    try {
      await sendBotMessage(session.apiClient, bot.id, text, route.params.taskId);
      // Only a confirmed HTTP response clears the draft. If the response is
      // lost after server acceptance, the user can decide whether to retry.
      setDraft("");
      setUncertainDraft(null);
      setSendState("idle");
    } catch (error) {
      const failure = commandFailureKind(error);
      setUncertainDraft(failure === "unknown" ? text : null);
      setSendState(failure);
    }
  }

  async function onInterrupt() {
    if (!canCommand || !session || !bot || stopping) return;
    setStopping(true);
    try {
      await interruptBot(session.apiClient, route.params.botId, route.params.taskId);
    } catch {
      // The stream remains authoritative for busy state and task completion.
    } finally {
      setStopping(false);
    }
  }

  const renderRow = ({item}: {item: ConversationRow}) => (
    <View style={[styles.messageRow, item.role === "user" ? styles.userRow : styles.botRow]}>
      <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.botBubble]}>
        <Text style={styles.messageText}>{item.text || "Activity"}</Text>
        {(item.queued || item.deleted) && (
          <Text style={styles.marker}>{[item.queued ? "Queued" : "", item.deleted ? "Deleted" : ""].filter(Boolean).join(" · ")}</Text>
        )}
      </View>
    </View>
  );

  if (!bot) {
    return <View style={styles.center}>
      <Text style={styles.muted}>{botRecord ? "This conversation changed. Return to the workspace to rehydrate the selected task." : "Agent unavailable."}</Text>
      <Pressable accessibilityRole="button" onPress={() => navigation.replace("Workspace")} style={styles.returnButton}><Text style={styles.returnText}>Back to workspace</Text></Pressable>
    </View>;
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <View style={styles.headerCopy}><Text style={styles.title}>{bot.name || bot.title || "Agent"}</Text><Text style={styles.status}>{snapshot.status === "connected" ? (bot.busy ? "Busy" : "Ready") : snapshot.status}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => void onInterrupt()} disabled={!canCommand || stopping || !bot.busy} style={[styles.stop, (!canCommand || stopping || !bot.busy) && styles.disabled]}>
          <Text style={styles.stopText}>{stopping ? "Stopping…" : "Stop"}</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.transcript}
        maintainVisibleContentPosition={{minIndexForVisible: 0}}
        onContentSizeChange={onContentSizeChange}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
        ListFooterComponent={streaming ? <View style={[styles.messageRow, styles.botRow]}><View style={[styles.bubble, styles.botBubble, styles.streaming]}><Text style={styles.messageText}>{streaming}</Text><Text style={styles.marker}>Streaming…</Text></View></View> : null}
      />
      <View style={styles.composer}>
        {sendState === "rejected" && <Text style={styles.failure}>Send was rejected. Check the transcript before retrying; your draft is still here.</Text>}
        {sendState === "unknown" && <Text style={styles.failure}>Outcome unknown—the server may have accepted this turn. Check the transcript; edit the draft before sending it again.</Text>}
        <View style={styles.composeRow}>
          <TextInput
            accessibilityLabel="Message agent"
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              if ((sendState === "rejected" || sendState === "unknown") && value !== draft) {
                setSendState("idle");
                setUncertainDraft(null);
              }
            }}
            editable={canCommand && sendState !== "sending"}
            multiline
            placeholder="Message this agent"
            placeholderTextColor="#858b99"
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void onSend()}
            disabled={!canCommand || sendState === "sending" || sendState === "unknown" || !draft.trim()}
            style={[styles.send, (!canCommand || sendState === "sending" || sendState === "unknown" || !draft.trim()) && styles.disabled]}
          >
            {sendState === "sending" ? <ActivityIndicator color="#101114" /> : <Text style={styles.sendText}>{sendState === "unknown" ? "Check transcript" : sendState === "rejected" ? "Retry" : "Send"}</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: "#101114"}, center: {alignItems: "center", backgroundColor: "#101114", flex: 1, justifyContent: "center"},
  muted: {color: "#858b99", fontSize: 15}, returnButton: {borderColor: "#4a4f5d", borderRadius: 6, borderWidth: 1, marginTop: 16, paddingHorizontal: 14, paddingVertical: 9}, returnText: {color: "#c5c8d0", fontWeight: "600"}, header: {alignItems: "center", borderBottomColor: "#303540", borderBottomWidth: 1, flexDirection: "row", minHeight: 70, paddingHorizontal: 16},
  back: {padding: 8}, backText: {color: "#f4f5f7", fontSize: 34, lineHeight: 34}, headerCopy: {flex: 1, marginLeft: 8}, title: {color: "#f4f5f7", fontSize: 19, fontWeight: "700"}, status: {color: "#858b99", fontSize: 12, marginTop: 3}, stop: {borderColor: "#985050", borderRadius: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8}, stopText: {color: "#f18a8a", fontWeight: "600"},
  transcript: {gap: 10, padding: 16, paddingBottom: 24}, empty: {color: "#858b99", paddingTop: 24, textAlign: "center"}, messageRow: {flexDirection: "row"}, userRow: {justifyContent: "flex-end"}, botRow: {justifyContent: "flex-start"}, bubble: {borderRadius: 12, maxWidth: "85%", paddingHorizontal: 13, paddingVertical: 10}, userBubble: {backgroundColor: "#355a91"}, botBubble: {backgroundColor: "#1b1e25", borderColor: "#303540", borderWidth: 1}, streaming: {borderColor: "#8a6b4a"}, messageText: {color: "#f4f5f7", fontSize: 15, lineHeight: 21}, marker: {color: "#b9a888", fontSize: 11, marginTop: 5}, composer: {borderTopColor: "#303540", borderTopWidth: 1, padding: 12}, composeRow: {alignItems: "flex-end", flexDirection: "row", gap: 8}, input: {backgroundColor: "#1b1e25", borderColor: "#3b414e", borderRadius: 8, borderWidth: 1, color: "#f4f5f7", flex: 1, maxHeight: 110, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10}, send: {alignItems: "center", backgroundColor: "#8ab4ff", borderRadius: 8, justifyContent: "center", minHeight: 44, minWidth: 62, paddingHorizontal: 12}, sendText: {color: "#101114", fontWeight: "700"}, disabled: {opacity: 0.45}, failure: {color: "#f18a8a", fontSize: 12, marginBottom: 8},
});
