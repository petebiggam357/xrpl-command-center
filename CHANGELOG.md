# Changelog

All notable changes to **XRPL Command Center** are documented in this file.

## [0.0.3-alpha] - 2026-11-25

### Added
- **Process-Isolated Rust Cryptographic Vault Sidecar (`rust-vault/xrpl-vault-sidecar`):**
  - Compiled native Rust binary (~718 KB stripped LTO release) communicating over a zero-network stdin/stdout JSON-RPC pipe with Electron Main.
  - **Argon2id** (`64 MiB, t=3, p=1`) + **AES-256-GCM** encrypted vault (`wallet-vault-rust.enc.json`, `0600` Unix permissions) with deterministic **`Zeroizing`** RAM scrubbing on lock, timeout, or process exit.
  - Native Rust **`ed25519-dalek`** and RFC-6979 low-S **`k256` (`secp256k1`)** XRPL key derivation & transaction signing—keeping private keys completely out of Node.js/V8 memory while retaining 100% official `xrpl.js` Day-1 amendment canonical serialization (`encodeForSigning` / `encodeForMultiSigning`).
  - Cross-language cryptographic interop test suite (`tests/rustVaultInterop.test.ts`) verifying bit-for-bit `ed25519`, `secp256k1`, and XRPL Genesis Seed parity against `xrpl.js`.
- **Hardened Electron Runtime:** Denied unneeded browser permissions via `setPermissionRequestHandler` (WebHID Ledger `0x2c97` isolated to `setDevicePermissionHandler`), added `will-navigate` origin lock, and bundled the native Rust sidecar across Linux, Windows, and macOS in `electron-builder.yml` and `.github/workflows/build.yml`.
- **UI Security Telemetry:** `WalletDeck` displays live `RUST SIDECAR • Argon2id + Zeroize (PID ...)` status badge.

## [0.0.2-alpha] - 2026-11-25

### Added
- **Track 1 — One-Click Docker Node Manager & Visual `rippled.cfg` Diff Studio (`My Node Ops`):**
  - Cross-platform Docker `xrpld` orchestrator (`electron/dockerNodeService.ts`) provisioning `xrpllabsofficial/xrpld:latest` for Mainnet, Testnet, or Devnet with Admin RPC (`127.0.0.1:5005`) and WS (`127.0.0.1:6006`) strictly bound to loopback, plus Start / Stop / Restart / Remove and container log tailing.
  - Visual `rippled.cfg` & `validators.txt` editor with hardware presets (`16GB Light`, `32GB Standard`, `64GB Full`, `NuDB` / `RocksDB`), live red/green unified line diff preview, and automatic timestamped `.bak` backups.
- **Track 2 — Ledger Hardware Wallet (WebHID), Air-Gapped QR & Native Multi-Sign (`Wallets & DeFi`):**
  - Chromium WebHID USB driver (`src/services/ledgerWebHid.ts`) + BIP-44 (`44'/144'/0'/0/0`) XRP APDU framing for Ledger Nano / Stax / Flex devices.
  - Air-Gapped QR unsigned `tx_json` export & externally signed `tx_blob` broadcaster right inside `TxConfirmModal`.
  - Native XRPL Multi-Sign (`SignerListSet` quorum builder + partial vault signer `wallet.sign(tx, true)` + `xrpl.multisign` combiner & broadcaster).
- **Track 3 — Pro DEX & AMM Terminal:**
  - Smart Auto-Bridging Pathfinding Swap (`ripple_path_find`) with configurable slippage tolerance (`0.5%`, `1.0%`, `2.5%`) enforcing `tfPartialPayment` + `DeliverMin` + `SendMax`.
  - Interactive 60fps `DexDepthCanvas` visualizing cumulative CLOB bid/ask walls and the XLS-30 AMM `x·y=k` constant-product invariant curve with live price-impact simulation.
  - Added `AMMCreate` (pool creation) and `AMMVote` (LP trading fee governance vote).
- **Track 4 — Institutional Primitives Studio (`Institutional`):**
  - Multi-Purpose Tokens (`MPTokenIssuanceCreate`, `MPTokenAuthorize`), regulated IOU `Clawback` (`XLS-39`), and Issuer `AccountSet` flags (`DefaultRipple`, `RequireDest`, `AllowClawback`, `Domain`).
  - Interactive `xrp-ledger.toml` generator, real-time linter, and 1-click on-ledger `Domain` linking.
  - Native On-Ledger Price Oracles (`XLS-47`: `get_aggregate_price`, `OracleSet`, `OracleDelete`) and W3C Decentralized Identity (`XLS-40`: `did:xrpl` resolver, `DIDSet`, `DIDDelete`).
- **Track 5 — Embedded SQLite Analytics, CSV Export, System Tray Watchdog & Auto-Updater (`Analytics & Tray`):**
  - Real WebAssembly SQLite database (`sql.js` -> `userData/command-center.sqlite`) persisting ledger throughput history & tracked wallet transaction journals with 1-click RFC-4180 CSV accounting exports.
  - OS System Tray mode (`Minimize to Tray on Close`), 30-second background `rippled` node health watchdog firing native desktop alerts, and `electron-updater` release checks.
- **Expanded Test Suite:** 17 passing Vitest tests covering codecs, encrypted vault lifecycle, config diff engine, Ledger WebHID APDU framing, AMM `x·y=k` slippage math, `xrp-ledger.toml` linting, institutional tx builders, and live `sql.js` SQLite + CSV exports.

## [0.0.1-alpha] - 2026-11-24

### Added
- Initial cross-platform Electron desktop release (`.AppImage`, `.exe`, `.dmg`) with live XRPL WebSocket failover pool, 60fps Consensus Core & Transaction Particle River, 3D Validator Globe, Validator Constellation, Token/DEX/AMM Explorer, Encrypted Local Wallet Vault, Self-Hosted Node Ops console, and Universal `Ctrl+K` Inspector.
