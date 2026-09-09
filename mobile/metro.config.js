const path = require('node:path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '..');
const coreRoot = path.resolve(workspaceRoot, 'packages/bloks-core');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  // The shared client core is intentionally source-linked during the
  // migration so web and native clients exercise the same contracts/events.
  watchFolders: [coreRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
});
