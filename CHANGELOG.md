# Changelog

All notable changes to **XRPL Command Center** are documented in this file.

## [0.0.1-alpha] - 2026-11-24

### Added
- **Cross-Platform Desktop Shell:** Electron + Vite + React + TypeScript packaging configured for Linux `.AppImage`, Windows `.exe` (NSIS & portable), and macOS `.dmg` (`arm64` & `x64`), plus GitHub Actions matrix workflow (`.github/workflows/build.yml`).
- **Resilient XRPL WebSocket Stream Engine:** Automatic failover pool across Mainnet, Testnet, Devnet, and custom/local `rippled` endpoints with split subscriptions (`ledger`, `transactions`, `transactions_proposed`, `validations`, `consensus`, `server`) and live RTT latency monitoring.
- **Command Deck Real-Time Animations:**
  - 60fps HTML5 Canvas **Live Consensus Core** animating `OPEN → ESTABLISH → 80% UNL QUORUM → VALIDATED` cycles with ledger-close shockwaves.
  - 60fps 6-lane **Transaction Particle River** visualizing live XRP payments, IOUs/MPTs, DEX orders, AMM swaps, NFTs, and TrustLines with click-to-inspect packets and whale highlights.
  - Interactive scrolling **Validated Ledger Chain** and filterable **Live Decoded Transaction Tape**.
- **3D Holographic Validator Globe:** Interactive Three.js WebGL2 globe plotting global XRPL topology with live geodesic consensus arcs.
- **Validator Constellation:** XRPLF Validator History Service integration with UNL filtering, 1h/24h/30d agreement scores, `rippled` version breakdown, and live `validationReceived` pulse tracking.
- **Token Universe, DEX & AMM Explorer:** Global token index (`s1.xrplmeta.org`) with live-stream token discovery, 160-bit hex currency decoding (e.g., `RLUSD`, `SOLO`, `CORE`, LP tokens), and direct on-ledger RPC verification of issuer security flags (`Blackholed`, `GlobalFreeze`, `NoFreeze`, `Clawback`, `RequireAuth`, `DefaultRipple`), DEX orderbook depth, and AMM reserves.
- **Self-Hosted Node Ops Console (`rippled` / Clio):** Loopback & SSH-tunneled Admin RPC telemetry (`server_info`, `peers`, `feature`, `can_delete`), 1-click stream switch to user's own node, local `debug.log` tailing, and confirmation-gated admin actions (`connect`, `log_level`, `can_delete`, `stop`).
- **Universal Deep Inspector (`Ctrl+K`) & Native Watchlist Alerts:** Instant lookup for `r...` accounts, 64-char tx hashes, and ledger indices plus OS desktop alerts.
- **Protocol Test Suite:** Vitest coverage for BigInt drops math, hex currency decoding, issuer risk flags, transaction classification, and query routing.
