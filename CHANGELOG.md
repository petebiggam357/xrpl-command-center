# Changelog

All notable changes to **XRPL Command Center** are documented in this file.

## [0.0.1-alpha] - 2026-11-24

### Added
- **Encrypted Multi-Wallet Vault & DeFi Studio (`Wallets & DeFi`):**
  - Passphrase-encrypted local vault (`scrypt` + `AES-256-GCM` + OS `safeStorage` keyring wrapper, `0600` permissions, 15-minute auto-lock) isolated inside the Electron Main process, plus Watch-Only `r...` account tracking.
  - Multi-wallet portfolio with Spendable vs. Base/Owner Reserve XRP breakdown, SVG Receive QR modal, and 1-click **Testnet & Devnet Faucet** funding.
  - **Payments & TrustLines:** Send XRP or Issued Tokens with automatic `lsfRequireDestTag` & unfunded-account pre-flight protection, public hex memos, and `TrustSet` add/modify/remove controls.
  - **Native DEX & XLS-30 AMM Trading:** Place/cancel DEX orders (`OfferCreate` Limit/Passive/IOC/FOK, `OfferCancel`) and deposit/withdraw in XRPL AMM pools (`AMMDeposit`, `AMMWithdraw`).
  - **Escrows, Checks & XLS-20 NFTs:** Create/release/cancel time-locked XRP Escrows, create/cash/cancel Checks, and view/mint/transfer/burn `NFToken`s.
  - **Human-in-the-Loop Pre-Flight Signing Modal:** Network-aware (`MAINNET` warning vs. `TESTNET`/`DEVNET`) review displaying fee cap, safety checks, and unsigned `tx_json` before signing.
- **Cross-Platform Desktop Shell:** Electron + Vite + React + TypeScript packaging configured for Linux `.AppImage`, Windows `.exe` (NSIS & portable), and macOS `.dmg` (`arm64` & `x64`), plus GitHub Actions matrix workflow (`.github/workflows/build.yml`).
- **Resilient XRPL WebSocket Stream Engine:** Automatic failover pool across Mainnet, Testnet, Devnet, and custom/local `rippled` endpoints with split subscriptions (`ledger`, `transactions`, `transactions_proposed`, `validations`, `consensus`, `server`) and live RTT latency monitoring.
- **Command Deck Real-Time Animations:**
  - 60fps HTML5 Canvas **Live Consensus Core** animating `OPEN → ESTABLISH → 80% UNL QUORUM → VALIDATED` cycles with ledger-close shockwaves.
  - 60fps 6-lane **Transaction Particle River** visualizing live XRP payments, IOUs/MPTs, DEX orders, AMM swaps, NFTs, and TrustLines with click-to-inspect packets and whale highlights.
  - Interactive scrolling **Validated Ledger Chain** and filterable **Live Decoded Transaction Tape**.
- **3D Holographic Validator Globe:** Interactive Three.js WebGL2 globe plotting global XRPL topology with live geodesic consensus arcs.
- **Validator Constellation:** XRPLF Validator History Service integration with UNL filtering, 1h/24h/30d agreement scores, `rippled` version breakdown, and live `validationReceived` pulse tracking.
- **Token Universe, DEX & AMM Explorer:** Global token index (`s1.xrplmeta.org`) with live-stream token discovery, 160-bit hex currency decoding (`RLUSD`, `SOLO`, `CORE`, LP tokens), and direct on-ledger RPC verification of issuer security flags (`Blackholed`, `GlobalFreeze`, `NoFreeze`, `Clawback`, `RequireAuth`, `DefaultRipple`), DEX orderbook depth, and AMM reserves.
- **Self-Hosted Node Ops Console (`rippled` / Clio):** Loopback & SSH-tunneled Admin RPC telemetry (`server_info`, `peers`, `feature`, `can_delete`), 1-click stream switch to user's own node, local `debug.log` tailing, and confirmation-gated admin actions (`connect`, `log_level`, `can_delete`, `stop`).
- **Universal Deep Inspector (`Ctrl+K`) & Native Watchlist Alerts:** Instant lookup for `r...` accounts, 64-char tx hashes, and ledger indices plus OS desktop alerts.
- **Test Suite:** 12 automated Vitest tests covering BigInt drops math, hex currency codecs, issuer risk flags, encrypted vault lifecycle, and canonical DeFi transaction builders.
