# @bloks/core

Platform-independent client contracts for the Bloks web and React Native
clients.

This first extraction owns the client-safe API data shapes and defensive SSE
parsing. The existing web reducer remains in `src/state/reducer.ts` for this
step: moving it requires reconciling its browser-only selection persistence
with a platform-neutral state boundary. That reducer extraction is the next
safe increment; consumers should use the contracts and event parser here in
the meantime.
