import React, {useEffect, useState} from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';
import {claimPairing} from '../network/pairing';
import {useConnection} from '../connection/context';
import {classifyPairingFailure, pairingFailureMessage, parseManualPairing, type PairingFailure} from '../connection/pairing-input';

type Props = NativeStackScreenProps<RootStackParamList, 'Pairing'>;

export function PairingScreen({navigation, route}: Props) {
  const {storage, connect} = useConnection();
  const [address, setAddress] = useState('');
  const [credential, setCredential] = useState('');
  const [deviceName, setDeviceName] = useState('Android device');
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | PairingFailure>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = route.params;
    if (!params) return;
    if (params.address) setAddress(params.address);
    if (params.token || params.code) setCredential(params.token ?? params.code ?? '');
    setStatus('idle');
    setMessage(params.name
      ? `Pairing details received from ${params.name}. Review them, then connect.`
      : 'Pairing details received. Review them, then connect.');
  }, [route.params]);

  async function onConnect() {
    setStatus('working');
    setMessage('Connecting to Bloks…');
    try {
      const link = parseManualPairing(address, credential);
      const claim = await claimPairing(link, deviceName);
      await storage.writePairedConnection(claim.token, {baseUrl: link.baseUrl, deviceId: claim.device.id});
      connect({baseUrl: link.baseUrl, deviceId: claim.device.id});
      setStatus('success');
      setMessage('Connected.');
      navigation.reset({index: 0, routes: [{name: 'Workspace'}]});
    } catch (error) {
      const failure = classifyPairingFailure(error);
      setStatus(failure);
      setMessage(pairingFailureMessage(failure));
    }
  }

  const working = status === 'working';
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Connect Bloks</Text>
        <Text style={styles.body}>Scan a bloks://pair link from the desktop app, or enter its LAN address and pairing code.</Text>
        <TextInput value={address} onChangeText={setAddress} placeholder="Server address (192.168.1.20:8787)" placeholderTextColor="#737987" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} editable={!working} />
        <TextInput value={credential} onChangeText={setCredential} placeholder="Six-digit code or one-time token" placeholderTextColor="#737987" autoCapitalize="none" autoCorrect={false} keyboardType="default" style={styles.input} editable={!working} />
        <TextInput value={deviceName} onChangeText={setDeviceName} placeholder="Device name (optional)" placeholderTextColor="#737987" style={styles.input} editable={!working} />
        <Pressable accessibilityRole="button" accessibilityLabel="Connect to Bloks" onPress={onConnect} disabled={working} style={({pressed}) => [styles.button, pressed && styles.buttonPressed, working && styles.buttonDisabled]}>
          {working ? <ActivityIndicator color="#101114" /> : <Text style={styles.buttonText}>Connect</Text>}
        </Pressable>
        {!!message && <Text accessibilityLiveRegion="polite" style={[styles.message, status === 'success' && styles.success]}>{message}</Text>}
        <Text style={styles.note}>Your token is stored in the Android Keystore. Disconnecting later clears this device only.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#101114'},
  card: {width: '100%', maxWidth: 520, alignSelf: 'center'},
  title: {color: '#f4f5f7', fontSize: 28, fontWeight: '700', marginBottom: 12},
  body: {color: '#c5c8d0', fontSize: 16, lineHeight: 24},
  input: {color: '#f4f5f7', backgroundColor: '#1b1e25', borderColor: '#343946', borderWidth: 1, borderRadius: 8, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14},
  button: {backgroundColor: '#8ab4ff', alignItems: 'center', borderRadius: 8, minHeight: 48, justifyContent: 'center', marginTop: 18},
  buttonPressed: {opacity: 0.8},
  buttonDisabled: {opacity: 0.65},
  buttonText: {color: '#101114', fontSize: 16, fontWeight: '700'},
  message: {color: '#f0b86e', fontSize: 14, lineHeight: 20, marginTop: 14},
  success: {color: '#8fdbad'},
  note: {color: '#858b99', fontSize: 13, lineHeight: 19, marginTop: 20},
});
