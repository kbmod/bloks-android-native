# @bloks/core

Platform-independent client contracts for the Bloks web and React Native
clients.

The package owns the client-safe API data shapes, defensive SSE parsing, and
the platform-neutral application reducer. Browser selection and project
persistence remain in the web store; native clients seed the reducer with
their own persisted values through `createInitialState`.

The next safe increment is to use this shared state boundary for Android
connection restoration, initial hydration, and event folding.
