# Bloks Android Native Plan

## Objective

Build a real Android client for Bloks without a WebView. The Android app
connects to the existing Bloks harness running on the user's computer and
preserves the existing provider sessions, agents, rooms, approvals, event
stream, and persisted data.

Work continues in the order below until the available usage window ends.
Anything unfinished remains in scope and resumes in the next session; features
are not permanently cut to meet an artificial one-night deadline.

## Architecture decision

Use bare React Native with TypeScript.

React Native renders native Android views and does not require a WebView. It
also gives this fork the greatest practical reuse of the original project:

- Keep the existing `server/` harness and provider integrations.
- Share browser-independent TypeScript contracts, reducer logic, API contracts,
  event parsing, and pure utilities.
- Rebuild the presentation layer with native Android components.
- Keep provider transports and secrets out of the Android UI, preserving the
  project's existing client/server boundary.

Kotlin with Jetpack Compose remains a valid long-term alternative, but it
would require rewriting all TypeScript client state and transport logic as
well as the UI. The React DOM components cannot be reused by either approach
without a WebView.

```text
React Native Android app
        |
        +-- authenticated HTTP commands
        +-- resumable SSE event stream
                    |
             Existing Bloks harness
                    |
          Existing agents/providers/data
```

## Proposed repository layout

```text
packages/bloks-core/
  src/contracts.ts
  src/reducer.ts
  src/api.ts
  src/events.ts

mobile/
  android/
  src/
    components/
    navigation/
    network/
    screens/
    security/
    state/
    theme/
```

`packages/bloks-core` must remain platform-independent. Both the existing web
client and the Android client should consume it so behavior is shared rather
than copied.

## Initial working product

The first installable APK must support the core remote-client loop:

- Pair with a Bloks computer through the existing `bloks://pair` link or a
  manual address and pairing credential.
- Store the paired-device bearer token using Android Keystore-backed storage.
- Restore a saved connection without exposing its token in logs or ordinary
  application storage.
- List agents and rooms.
- Open agent and room transcripts.
- Send messages to an agent or room.
- Display assistant text as it streams.
- Display settled text, notices, and tool activity.
- Display and answer permission and question cards.
- Interrupt a running agent.
- Recover after backgrounding, network loss, and server restart.
- Rehydrate when the server's event replay window cannot cover a gap.
- Produce an installable debug APK verified on a physical device or emulator.

## Existing protocol to preserve

### Pairing and authentication

Direct LAN pairing is the first transport:

1. The desktop enables remote pairing and restarts the harness so it binds to
   the network interface.
2. The desktop starts a five-minute pairing window.
3. Android receives a link shaped like:

   ```text
   bloks://pair?address=<host:port>&token=<one-time-token>&code=<six-digit-code>&name=<computer>
   ```

4. Android calls `POST /api/pair/claim` with the one-time credential and a
   device name.
5. The returned bearer token is shown only once and stored in secure storage.
6. All later LAN calls use `Authorization: Bearer <device-token>`.

The system camera can open the registered deep link, avoiding an in-app camera
dependency. Manual entry remains available.

### Initial hydration

The client loads:

- `GET /api/bots?messages=50`
- `GET /api/bloks`
- `GET /api/instances`
- `GET /api/providers`
- `GET /api/config`

Unknown fields and unknown message kinds must be retained or ignored safely so
the mobile app remains forward-compatible with a newer harness.

### Commands

The first UI uses these existing routes:

- `POST /api/bots/:id/messages`
- `POST /api/bloks/:id/messages`
- `POST /api/bots/:id/respond`
- `POST /api/bots/:id/interrupt`
- `POST /api/threads/:threadId/messages/:messageId/choose`
- `POST /api/workflows/runs/:runId/answer`
- `PATCH /api/bots/:id` for unread state and later agent settings

### Live events

Android maintains one authenticated connection to `GET /api/events`.

- Record every numeric `_seq` value.
- Reconnect using `/api/events?since=<last-sequence>`.
- Treat `hello.resumed: true` as a continuous stream.
- When `hello.resumed` is false, reload server state.
- Deduplicate messages by message ID.
- Fold `message`, `message.patch`, `bot`, `bot.deleted`, `runtime`, `blok`,
  `blok.deleted`, `instances`, `providers`, and `config` frames.
- Build the transient assistant bubble from `runtime` events containing
  `content.delta` with `streamKind: assistant_text`.
- Clear transient streaming state on `turn.completed`.
- Close and reopen the stream around Android background/foreground changes.
- Never notify for replayed frames.

## Implementation sequence

### Phase 0: development gates

- Confirm Node, pnpm, Java, Android SDK, Gradle, ADB, and an emulator or physical
  device.
- Confirm the existing desktop typecheck and focused tests pass before shared
  code moves.
- Enable the harness's network pairing mode, restart it, and verify that an
  Android device can reach `GET /api/health`.

### Phase 1: shared core

- Create a workspace package for client-safe contracts and state behavior.
- Extract the existing reducer without changing behavior.
- Extract or define typed API and event-frame contracts.
- Keep compatibility exports for the existing React client.
- Run the reducer and TypeScript tests after every extraction step.

### Phase 2: Android scaffold

- Add a bare React Native application under `mobile/`.
- Configure the Android application ID, build variants, theme, safe areas,
  navigation, and the `bloks://pair` intent filter.
- Permit direct-LAN HTTP only in the development build. Do not silently ship a
  production configuration that allows arbitrary cleartext traffic.
- Add secure storage, navigation, and SSE support with the smallest dependable
  dependency set.

### Phase 3: connection and pairing

- Implement a typed JSON API client with bearer injection and bounded errors.
- Parse and validate pairing deep links.
- Implement manual host, port, and credential entry.
- Claim the pairing credential and save the returned token securely.
- Add connected, reconnecting, expired-pairing, unauthorized, and unreachable
  states.
- Add disconnect/forget behavior that clears local credentials without
  pretending to revoke the server-side device.

### Phase 4: hydration and event stream

- Hydrate agents, rooms, providers, instances, and safe config status.
- Implement SSE parsing, keepalive handling, reconnection, sequence recovery,
  and full rehydration after replay gaps.
- Fold frames through the shared reducer.
- Test duplicate frames, malformed frames, disconnects, server restarts,
  background/resume, and an exhausted replay buffer.

### Phase 5: native workspace and agent chat

- Build the native agent and room roster.
- Add busy, unread, archived, and connection indicators.
- Build a virtualized transcript with user, agent, notice, and activity rows.
- Add a native composer with sending, queued, failure, and interrupt states.
- Show the streaming assistant response separately from settled messages.
- Preserve reply metadata even before reply composition is exposed.

### Phase 6: approvals and rooms

- Render permission, question, setup, workflow, and generic decision cards.
- Route live approvals using the originating request and owning agent/task,
  rather than whichever conversation is visible.
- Make dismissal of a blocking approval deny it instead of hiding it.
- Render room speaker attribution and send room messages.
- Add room creation, member selection, mentions, lead-only behavior, and room
  management.

### Phase 7: broader feature parity

- Task lanes and active-task switching.
- Agent creation, editing, model selection, and approval mode.
- Message editing, deletion, reactions, replies, forwarding, and search.
- Attachments and image upload.
- Artifact listing, download, previews, and comments.
- Connector and secret cards.
- Structured components and gallery responses.
- Skills, plugins/MCP, projects, routines, workflows, and activity record.
- Voice, dictation, and text-to-speech using Android capabilities.
- Computer/screen viewing and control where the remote API permits it.
- Notifications and background delivery.
- Accessibility, tablets, adaptive layout, dark mode, and visual parity.

### Phase 8: encrypted relay and production networking

Direct LAN proves the product loop. Anywhere access then implements the
existing end-to-end encryption design:

- Derive the paired-device digest with SHA-256.
- Derive separate directional keys with HKDF-SHA256 using
  `bloks-relay-v1:phone-to-mac` and `bloks-relay-v1:mac-to-phone`.
- Encrypt envelopes using AES-256-GCM and a random 12-byte nonce.
- Add fresh timestamp and nonce fields to mutating requests.
- Use HTTPS for the relay connection.
- Specify or obtain the missing phone-facing relay service endpoints and add a
  relay catch-up strategy; direct SSE sequence replay is not currently carried
  through relay broadcasts.

### Phase 9: release readiness

- Unit-test shared reducer, pairing parsing, API errors, event folding, and
  relay crypto against Node fixtures.
- Add Android UI tests for pairing, chat, approvals, and recovery states.
- Run physical-device end-to-end tests through both LAN and relay transports.
- Verify tokens and message content do not appear in logs or crash reports.
- Define backup policy and secure-data deletion behavior.
- Add signed release builds, versioning, CI, linting, and store metadata.
- Run the original repository's full typecheck, tests, and build.

## Session checkpoints

At the end of every work session, record:

- The last completed phase and acceptance checks.
- Commands and devices used for validation.
- Known failures with exact reproduction steps.
- The next concrete implementation task.
- Any deviation from this architecture and why it was necessary.

The next session begins from that checkpoint rather than shrinking the scope.

## Initial acceptance checks

- The Android app contains no WebView-based application UI.
- Pairing works through a deep link and manual fallback.
- The bearer token is kept in Keystore-backed storage and absent from logs.
- Agents and rooms hydrate from the existing harness.
- Sending produces both a user message and a streamed assistant response.
- Permission allow/deny and question responses unblock the correct turn.
- Network loss and background/resume do not duplicate messages.
- A replay gap causes full rehydration.
- Unknown event and message kinds do not crash the app.
- A debug APK installs and runs.
- Existing desktop behavior and tests remain intact.

## Current known risks

- Enabling LAN pairing changes the harness bind address only after restart.
- Android blocks cleartext HTTP by default; LAN development must be isolated to
  a development-only network configuration.
- Room transcripts currently hydrate in full and need server pagination for
  large production workspaces.
- Approval routing can target a task thread that is not the visible chat.
- The repository contains the Mac side of the relay protocol but not a complete
  phone-facing client contract.
- Screen frames are large, intentionally omitted from replay, and not currently
  relayed.
- React DOM, Tailwind, Radix, xterm, browser APIs, and Electron bridges cannot
  be reused in native screens.
