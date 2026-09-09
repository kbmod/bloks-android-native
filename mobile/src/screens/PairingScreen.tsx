import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export function PairingScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Connect Bloks</Text>
      <Text style={styles.body}>
        Scan a bloks://pair link from the desktop app, or enter its LAN address and pairing code.
      </Text>
      <Text style={styles.note}>Pairing and secure token storage are implemented by the connection workstream.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#101114'},
  title: {color: '#f4f5f7', fontSize: 28, fontWeight: '700', marginBottom: 12},
  body: {color: '#c5c8d0', fontSize: 16, lineHeight: 24},
  note: {color: '#858b99', fontSize: 13, lineHeight: 19, marginTop: 20},
});
