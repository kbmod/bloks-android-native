import React, {useEffect, useRef, useState} from 'react';
import {NavigationContainer, type LinkingOptions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PairingScreen} from './src/screens/PairingScreen';
import {WorkspaceScreen} from './src/screens/WorkspaceScreen';
import {ConversationScreen} from './src/screens/ConversationScreen';
import {ConnectionProvider} from './src/connection/context';
import {restoreSavedConnection} from './src/connection/connection-bootstrap';
import type {PairedConnection, SecureConnectionStorage} from './src/security/token-storage';
import {createSecureConnectionStorage} from './src/security/react-native-keychain-storage';

export type RootStackParamList = {
  Pairing: {address?: string; token?: string; code?: string; name?: string} | undefined;
  Workspace: undefined;
  Conversation: {botId: string; taskId: string; threadId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['bloks://'],
  config: {
    screens: {
      Pairing: 'pair',
      Workspace: 'workspace',
    },
  },
};

export default function App() {
  const storage = useRef<SecureConnectionStorage | null>(null);
  const [initialConnection, setInitialConnection] = useState<PairedConnection | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const secureStorage = createSecureConnectionStorage();
    storage.current = secureStorage;
    restoreSavedConnection(secureStorage)
      .then((restored) => {
        if (!mounted) return;
        setInitialConnection(restored?.connection ?? null);
        setReady(true);
      })
      .catch(() => {
        // A broken native credential must not strand the app on a crash screen.
        if (mounted) setReady(true);
      });
    return () => { mounted = false; };
  }, []);

  if (!ready || !storage.current) {
    return <SafeAreaProvider><View style={styles.loading}><ActivityIndicator color="#8ab4ff" /><Text style={styles.loadingText}>Restoring connection…</Text></View></SafeAreaProvider>;
  }

  return (
    <ConnectionProvider storage={storage.current} initialConnection={initialConnection}>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          <Stack.Navigator initialRouteName={initialConnection ? 'Workspace' : 'Pairing'} screenOptions={{headerShown: false}}>
            <Stack.Screen name="Pairing" component={PairingScreen} />
            <Stack.Screen name="Workspace" component={WorkspaceScreen} />
            <Stack.Screen name="Conversation" component={ConversationScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ConnectionProvider>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101114', gap: 14},
  loadingText: {color: '#c5c8d0', fontSize: 15},
});
