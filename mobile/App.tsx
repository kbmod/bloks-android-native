import React from 'react';
import {NavigationContainer, type LinkingOptions} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PairingScreen} from './src/screens/PairingScreen';
import {WorkspaceScreen} from './src/screens/WorkspaceScreen';

export type RootStackParamList = {
  Pairing: undefined;
  Workspace: undefined;
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
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator initialRouteName="Pairing" screenOptions={{headerShown: false}}>
          <Stack.Screen name="Pairing" component={PairingScreen} />
          <Stack.Screen name="Workspace" component={WorkspaceScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
