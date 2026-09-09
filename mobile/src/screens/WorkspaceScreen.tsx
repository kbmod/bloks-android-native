import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export function WorkspaceScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Bloks</Text>
      <Text style={styles.body}>Your agents and rooms will appear here after pairing.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#101114'},
  title: {color: '#f4f5f7', fontSize: 28, fontWeight: '700', marginBottom: 12},
  body: {color: '#c5c8d0', fontSize: 16, lineHeight: 24},
});
