# Android Native Status

## 2026-09-10 checkpoint

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
- Added Android Keystore-backed paired-connection storage with atomic token and
  endpoint persistence, restoration, and local-only forget behavior.
- Implemented manual and `bloks://pair` connection flows with bounded pairing
  errors and no plaintext token persistence.
- Added defensive five-endpoint workspace hydration, shared event folding,
  replay-gap buffering and rehydration, and server-restart cursor recovery.
- Added an incremental React Native SSE transport with authenticated reconnect,
  bounded backoff, foreground/background lifecycle control, and explicit
  unauthorized and unreachable states.
- Wired the connection lifecycle into a native agent and room roster with
  connection, busy, unread, and archived indicators.
- Lifted workspace-session ownership above navigation so opening an agent chat
  never creates a second coordinator, SSE connection, or provider turn owner.
  This preserves the live-owner invariant behind the Hermes Agent Bot Chat
  deadlock fix: Android submits commands only through the harness-owned lane.
- Added the first Phase 5 agent conversation screen with a virtualized native
  transcript, queued/deleted and activity rows, a separate streaming response,
  sending and interrupt controls, and explicit ambiguous-delivery handling that
  retains the draft and never retries automatically.
- Installed Android Emulator 37.1.11 and an API 35 Google APIs x86_64 system
  image, and created the `bloks-phase0-api35` AVD.
- Corrected the Android activity theme to inherit from AppCompat after the
  first emulator launch exposed an immediate theme mismatch.

### Validation

- `pnpm typecheck`: passed.
- `pnpm --filter @bloks/mobile typecheck`: passed after the final dependency
  pins.
- Focused reducer/core/network, connection-storage, hydration, event-stream,
  pairing, and workspace-session tests: passed.
- Full desktop test suite with normal host permissions: 1,049 passed, 2
  skipped, 0 failed. A
  restricted-sandbox run failed on process, listener, and temporary-file
  permissions and was not treated as host evidence.
- `react-native config`: reports Android package name `dev.bloks.mobile` and
  discovers the native dependencies.
- A clean Metro Android bundle passed after expanding the monorepo watch root
  for pnpm symlink targets and enabling workspace package exports.
- `git diff --check`: passed.
- `./gradlew --no-daemon assembleDebug`: passed with Node 22.23.1, Java 21,
  Android SDK `/home/brit/.local/share/android-sdk`, and Gradle 8.12. The
  resulting APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

### Environment and device state

- Node: `/home/brit/.nvm/versions/node/v22.23.1/bin/node`.
- Java: `/usr/lib/jvm/java-21-openjdk-amd64`.
- Android SDK: `/home/brit/.local/share/android-sdk`.
- Gradle wrapper: 8.12, with the repository's 768 MB heap and one-worker
  limits.
- The AVD booted successfully once and the APK installed. Its first launch
  exposed the AppCompat theme mismatch now fixed in source. Later emulator
  retries, including three clean host-side KVM boots, exited before ADB
  registration. The corrected APK still needs a final install/launch smoke test
  on a fresh AVD or physical device.
- Harness LAN binding and pairing mode were not changed.

### Next task

Run the corrected APK on a fresh AVD or physical Android device and complete a
real pairing, hydration, send, stream, queue, and interrupt check against a
LAN-enabled harness. After that, continue Phase 5 transcript polish or begin
the Phase 6 approval-card and room-conversation increment.

### Architecture deviations

None. Cleartext HTTP remains debug-only, release networking remains
HTTPS-only, and the Android client still holds no provider transports.
