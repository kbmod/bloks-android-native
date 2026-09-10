import React, {useCallback, useEffect, useMemo, useSyncExternalStore, useState} from 'react';
import {AppState, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';
import {useConnection} from '../connection/context';
import {WorkspaceSessionCoordinator, type WorkspaceSessionSnapshot, type WorkspaceSessionStatus} from '../workspace/session-coordinator';

type Props = NativeStackScreenProps<RootStackParamList, 'Workspace'>;

const EMPTY_SNAPSHOT: WorkspaceSessionSnapshot = {
  status: 'idle',
  state: {
    bots: [], bloks: [], instances: [], providers: [], config: null, selectedId: '',
    settingsOpen: false, pluginsOpen: false, computerOpen: false, appSettingsOpen: false,
    newAgentOpen: false, newAgentFirstRun: false, skillsOpen: false, routinesOpen: false,
    newRoomOpen: false, projectsOpen: false, activityOpen: false, projectId: null,
    streaming: {}, screens: {}, provisioning: {}, connected: false, error: null,
  },
};

const STATUS_LABEL: Record<WorkspaceSessionStatus, string> = {
  idle: 'Starting…', hydrating: 'Loading workspace…', connecting: 'Connecting to Bloks…',
  connected: 'Connected', reconnecting: 'Reconnecting…', unreachable: 'Bloks is unreachable',
  unauthorized: 'Connection needs pairing again', stopped: 'Paused',
};

export function WorkspaceScreen({navigation}: Props) {
  const {connection, storage, disconnect} = useConnection();
  const [forgetting, setForgetting] = useState(false);
  const coordinator = useMemo(
    () => connection ? new WorkspaceSessionCoordinator({baseUrl: connection.baseUrl, storage}) : null,
    [connection, storage],
  );
  const subscribe = useCallback((listener: () => void) => coordinator?.subscribe(listener) ?? (() => {}), [coordinator]);
  const getSnapshot = useCallback(() => coordinator?.snapshot ?? EMPTY_SNAPSHOT, [coordinator]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!coordinator) return;
    void coordinator.start();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void coordinator.start();
      else if (next === 'background' || next === 'inactive') coordinator.stop();
    });
    return () => { appState.remove(); coordinator.stop(); };
  }, [coordinator]);

  async function onForget() {
    setForgetting(true);
    try {
      coordinator?.stop();
      await disconnect();
      navigation.reset({index: 0, routes: [{name: 'Pairing'}]});
    } finally {
      setForgetting(false);
    }
  }

  async function onRetry() {
    if (coordinator) await coordinator.restart();
  }

  const {state, status} = snapshot;
  const statusTone = status === 'connected' ? styles.good : status === 'unauthorized' ? styles.bad : styles.warn;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>Bloks</Text>
          <Text style={styles.address}>{connection?.baseUrl ?? 'No server selected'}</Text>
        </View>
        <View accessibilityRole="text" style={styles.statusRow}>
          {status === 'hydrating' || status === 'connecting' || status === 'reconnecting'
            ? <ActivityIndicator size="small" color="#f0b86e" />
            : <View style={[styles.dot, statusTone]} />}
          <Text style={[styles.status, statusTone]}>{STATUS_LABEL[status]}</Text>
        </View>
      </View>

      {(status === 'unreachable' || status === 'unauthorized') && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {status === 'unauthorized' ? 'This device is no longer authorized by Bloks.' : 'Check that Bloks is running and both devices are on the same network.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={status === 'unauthorized' ? onForget : onRetry} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>{status === 'unauthorized' ? 'Pair again' : 'Retry now'}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Agents</Text>
      {state.bots.length === 0
        ? <Text style={styles.empty}>No agents yet.</Text>
        : state.bots.map((bot) => (
          <View key={bot.id} style={[styles.row, bot.hidden && styles.archivedRow]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{bot.name || bot.title || 'Unnamed agent'}</Text>
              <Text style={styles.rowMeta}>{bot.hidden ? 'Archived' : bot.busy ? 'Busy' : 'Idle'}{bot.unread ? ' · Unread' : ''}</Text>
            </View>
            <View style={[styles.badge, bot.hidden ? styles.archivedBadge : bot.busy ? styles.busyBadge : styles.idleBadge]}>
              <Text style={styles.badgeText}>{bot.hidden ? 'ARCHIVED' : bot.busy ? 'BUSY' : 'READY'}</Text>
            </View>
          </View>
        ))}

      <Text style={styles.sectionTitle}>Rooms</Text>
      {state.bloks.length === 0
        ? <Text style={styles.empty}>No rooms yet.</Text>
        : state.bloks.map((room) => (
          <View key={room.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{room.name}</Text>
              <Text style={styles.rowMeta}>{room.memberIds.length} {room.memberIds.length === 1 ? 'member' : 'members'}</Text>
            </View>
          </View>
        ))}

      <Pressable accessibilityRole="button" accessibilityLabel="Disconnect and forget this device" onPress={onForget} disabled={forgetting} style={styles.disconnect}>
        {forgetting ? <ActivityIndicator color="#f4f5f7" /> : <Text style={styles.disconnectText}>Disconnect and forget this device</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#101114'}, content: {padding: 22, paddingBottom: 42},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14}, heading: {flex: 1},
  title: {color: '#f4f5f7', fontSize: 28, fontWeight: '700'}, address: {color: '#858b99', fontSize: 13, marginTop: 6},
  statusRow: {alignItems: 'center', flexDirection: 'row', gap: 7, paddingTop: 8}, dot: {borderRadius: 5, height: 10, width: 10}, status: {fontSize: 13, fontWeight: '600'},
  good: {color: '#8fdbad', backgroundColor: '#8fdbad'}, warn: {color: '#f0b86e', backgroundColor: '#f0b86e'}, bad: {color: '#f18a8a', backgroundColor: '#f18a8a'},
  notice: {backgroundColor: '#2a2420', borderColor: '#604936', borderRadius: 8, borderWidth: 1, marginTop: 22, padding: 14}, noticeText: {color: '#f0c79b', fontSize: 14, lineHeight: 20},
  smallButton: {alignSelf: 'flex-start', borderColor: '#8a6b4a', borderRadius: 6, borderWidth: 1, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8}, smallButtonText: {color: '#f4d4ad', fontSize: 13, fontWeight: '600'},
  sectionTitle: {color: '#f4f5f7', fontSize: 18, fontWeight: '700', marginTop: 30, marginBottom: 10}, empty: {color: '#858b99', fontSize: 14, paddingVertical: 10},
  row: {alignItems: 'center', backgroundColor: '#1b1e25', borderColor: '#303540', borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10}, archivedRow: {opacity: 0.72}, rowMain: {flex: 1}, rowTitle: {color: '#f4f5f7', fontSize: 15, fontWeight: '600'}, rowMeta: {color: '#858b99', fontSize: 13, marginTop: 4},
  badge: {borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5}, idleBadge: {backgroundColor: '#25332d'}, busyBadge: {backgroundColor: '#3a3023'}, archivedBadge: {backgroundColor: '#34363d'}, badgeText: {color: '#d7dae2', fontSize: 10, fontWeight: '700'},
  disconnect: {alignItems: 'center', borderColor: '#4a4f5d', borderRadius: 8, borderWidth: 1, justifyContent: 'center', marginTop: 34, minHeight: 46, paddingHorizontal: 14}, disconnectText: {color: '#f4f5f7', fontSize: 14, fontWeight: '600'},
});
