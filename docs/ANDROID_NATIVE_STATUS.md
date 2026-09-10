# Android Native Status

## 2026-09-09 checkpoint

### Completed

- Installed the locked JavaScript workspace dependencies with Node 22.23.1 and
  pnpm 10.34.5.
- Installed Android SDK Platform 35, Build Tools 35.0.0, and NDK
  27.1.12297006 alongside the existing SDK 34 tools.
- Extracted the web reducer into the platform-neutral `@bloks/core` package.
  Browser selection and project persistence remain synchronous in the web
  store, while native clients can seed state through `createInitialState`.
- Preserved the old `src/state/reducer.ts` import surface as a compatibility
  shim and added a directly discovered core reducer test.
- Repaired React Native autolinking by adding the matching CLI and an explicit
  Android package-name configuration.
- Added the React Native 0.78.3 codegen package directly for pnpm's strict
  dependency layout.
- Pinned `react-native-screens` to 4.12.0, which supports the legacy Paper
  architecture used by this React Native 0.78 app. The previous caret range
  resolved to 4.27.0, which no longer supports this React Native generation.

### Validation

- `pnpm typecheck`: passed.
- `pnpm --filter @bloks/mobile typecheck`: passed after the final dependency
  pins.
- Focused reducer/core/network tests: passed.
- Full desktop test suite with normal host permissions: 1,035 passed, 2
  skipped, 0 failed. A restricted-sandbox run failed on process, listener, and
  temporary-file permissions and was not treated as host evidence.
- `react-native config`: reports Android package name `dev.bloks.mobile` and
  discovers the native dependencies.
- `git diff --check`: passed.
- The Android build advanced past its original
  `generateAutolinkingPackageList` failure. The next attempt exposed the
  missing direct codegen dependency; that dependency and the compatible
  `react-native-screens` pin are now installed, but the build was deliberately
  stopped before a final post-pin run when the session ended.

### Environment and device state

- Node: `/home/brit/.nvm/versions/node/v22.23.1/bin/node`.
- Java: `/usr/lib/jvm/java-21-openjdk-amd64`.
- Android SDK: `/home/brit/.local/share/android-sdk`.
- Gradle wrapper: 8.12, with the repository's 768 MB heap and one-worker
  limits.
- No emulator is installed and no physical-device validation has been run.
- Harness LAN binding and pairing mode were not changed.

### Next task

Run `./gradlew --no-daemon assembleDebug` with the environment above. If it
passes, record the APK path and checksum, then either install an emulator or
attach a physical Android device for the Phase 0 install/launch check. After
that, begin the Android connection-restoration, initial-hydration, and shared
event-folding increment described in `packages/bloks-core/README.md`.

### Architecture deviations

None. Cleartext HTTP remains debug-only, release networking remains
HTTPS-only, and the Android client still holds no provider transports.
