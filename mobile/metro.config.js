const path = require('node:path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '..');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  // The shared client core is intentionally source-linked during the
  // migration so web and native clients exercise the same contracts/events.
  watchFolders: [workspaceRoot],
  resolver: {
    unstable_enablePackageExports: true,
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
});
