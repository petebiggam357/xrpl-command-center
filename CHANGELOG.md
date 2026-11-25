# Changelog

All notable changes to **XRPL Command Center** are documented in this file.

## [0.1.3-beta] - 2026-11-25

### Added
- **XRPL Academy & Deep Education Hub (`XRPL Academy` tab + `Ctrl+K` quick-jump):**
  - **10 Built-In Deep Lessons** covering XRPL Consensus & 80% UNL Quorum, Accounts/Reserves (`1 XRP + 0.2 XRP/object`), Destination Tags & X-Addresses, TrustLines & Issuer Risk Flags, CLOB DEX + XLS-30 AMM `x·y=k` + Auto-Bridging, Escrows/Checks/XLS-20 NFTs, Rust Argon2id Vault + Hardware Custody, Institutional MPT/Oracles/DIDs/`xrp-ledger.toml`, Self-Hosted `rippled` Nodes on Custom Drives, and a Complete Command Center Tour—with persisted completion progress, search/category filters, and 1-click **"Try It Live"** links to matching app tabs.
  - **Interactive Reserve & Fee Lab:** Live sliders simulating Total XRP, TrustLines, DEX Orders, NFT Pages, and Escrows/Checks with real-time locked vs. spendable XRP & USD calculation.
  - **20-Term Searchable XRPL Glossary** and **12 Curated Official External Docs & Explorer Links** (`xrpl.org/docs`, `learn.xrpl.org`, `XRPLF/rippled`, `XRPL-Standards`, `XRPScan`, `Bithomp`, `livenet.xrpl.org`, and official faucets).
  - Lazy-loaded (`13.9 KB` gzipped) for zero cold-boot impact; verified by `tests/education.test.ts` (29/29 total Vitest tests passing).

## [0.1.2-beta] - 2026-11-25

### Added & Improved
- **Track 1 — Speed & File-Size Diet (Smaller Binaries + Instant Cold Boot):**
  - Enabled `esbuild` minification & tree-shaking for `dist-electron/main.js`, pruned duplicate already-bundled `node_modules` (`three`, `xrpl`, `lucide-react`, `react`, `qrcode`, `@noble`) from `app.asar`, restricted Chromium locales to `en-US`, and enabled `compression: maximum` in `electron-builder.yml`.
  - Code-split all 7 secondary modules (`3D Globe`, `Validators`, `Tokens`, `Wallets`, `Institutional`, `Node Ops`, `Analytics`) via `React.lazy()` + `<Suspense>` and deferred directory fetches by 300ms so cold startup only parses the Command Deck.
- **Track 2 — Multi-Wallet Combined Net Worth & Offline Printable Cold Recovery Sheet:**
  - Added a **Combined Portfolio Net Worth** card in the `Wallets` sidebar summing XRP + live USD across all tracked wallets with 1-click **Sync All**.
  - Added a 1-click **Paper Sheet** generator (`openPrintableRecoverySheet`) that opens an offline, print-ready cold recovery sheet with wallet address, QR code, and handwritten seed lines (never prints plaintext seeds).
- **Track 3 — Live FPS/Memory Performance HUD & Optional Whale/Watchlist Audio Ping:**
  - Added a zero-asset WebAudio synth chime (`src/services/alertAudio.ts`, muted by default) for Whale Radar & Watchlist alerts plus a toggleable live **FPS / TPS / Latency / Heap MB** diagnostic pill (`PerfHudPill.tsx`).
- **Track 4 — Saved Custom Node Endpoint Profiles (`Top HUD Bar`):**
  - Save, switch, and manage multiple custom `rippled` / Clio WebSocket profiles right from the Top HUD Bar network selector.
- **Track 5 — Open-SDK Cold & Hardware Wallet Hub (`HardwareWalletModal.tsx`):**
  - Expanded hardware wallet support beyond **Ledger USB (WebHID `0x2c97`)** to include **Trezor (Safe 3 / Safe 5 / Model T via local Trezor Bridge `127.0.0.1:21325` & WebUSB `0x1209` / `0x534c`)**, **Keystone 3 Pro**, **Tangem**, **D'CENT / Ellipal**, and **Xaman** cold wallets routed to Air-Gapped QR & Signed Blob broadcasting.

## [0.1.1-beta] - 2026-11-25

### Added
- **Custom Node Storage Drive & Folder Picker (`My Node Ops -> 1-Click Docker Node`):**
  - Choose any internal NVMe, secondary hard drive, or fast external SSD folder via native OS directory picker (`Browse Drive / Folder…`) or direct path entry to store large `NuDB` / `RocksDB` ledger databases off your OS root drive.
  - Persistent storage configuration (`node-storage-settings.json`) with live cross-platform drive free-space inspection (`fs.statfs`), low-disk-space warnings (`< 30 GB`), `Reset to Default`, and active container mount mismatch detection.
- **Native Linux AppImage & Desktop Dock Icon Integration:**
  - Bundled crisp multi-resolution PNG icon set (`16x16` through `512x512` in `build/icons/`), `StartupWMClass=xrpl-command-center` in `electron-builder.yml`, `nativeImage` window icon binding, and automatic Linux AppImage desktop/hicolor icon registration (`~/.local/share/icons` + `~/.local/share/applications`) so the running dock icon matches the XRPL Command Center emblem.

## [0.1.0-beta] - 2026-11-25

### Added
- **Track 1 — Smart Address Book, Exchange Destination-Tag Guard & X-Address Support:**
  - Full persistent Address Book inside `Wallets & DeFi` (`AddressBookPanel`) with categories (`Personal`, `Exchange`, `Issuer`, `Other`), default Destination Tags, and automatic human-readable address labels across the Live Tx Tape, Universal Inspector, and Send Payment form.
  - Real-time **Destination-Tag Safety Guard** (`checkDestinationTagSafety`) warning before sending to known exchanges (Coinbase, Kraken, Bitstamp, Binance, Uphold, KuCoin, Crypto.com) or user-flagged contacts without a Destination Tag.
  - Native **X-Address** encode/decode (`xrpl.xAddressToClassicAddress` / `classicAddressToXAddress`) integrated directly into Send Payment and Address Book.
- **Track 2 — Live USD Valuations, HUD Price Ticker & Whale Radar:**
  - Real-time **XRP/USD spot ticker** (CoinGecko + Coinbase Spot fallback) in the Top HUD Bar and live USD valuations across Wallet Portfolio balances.
  - Customizable **Whale Radar** filter in the Live Tx Tape (`≥ 10K / 50K / 100K / 500K XRP`) + 1-click **Save to Address Book** & **Watch** buttons in the Universal Inspector.
- **Track 3 — Searchable Account Tx History, UTF-8 Memo Decoder & Visual NFT Gallery:**
  - Searchable account transaction history inside Wallets with automatic **UTF-8 Memo decoding** (`decodeXrplMemos`), **1-click Repeat Payment**, and decoded Memos inside the Universal Inspector.
  - Safe IPFS/HTTPS **Visual NFT Gallery** preview cards in `Escrows, Checks & NFTs`.
- **Track 4 — 1-Click Encrypted `.xrplvault` Backup/Restore, Top-Bar Vault Pill & XRPL Reserve Meter:**
  - Native OS file dialog **Export / Restore** of Rust-encrypted `.xrplvault` backup files (Argon2id + AES-256-GCM ciphertext only — never touches plaintext seeds), with automatic `.bak` safety snapshots before restore.
  - Persistent **Vault Open / Locked** status pill in the Top HUD Bar and a visual **XRPL Reserve Meter** (`1 XRP base + 0.2 XRP/object` vs spendable XRP).
- **Track 5 — 1-Click Testnet Playground, Quick-Start Modal & Amendment Voting Radar:**
  - Skippable **Quick-Start Welcome Modal** (`QuickStartModal`) featuring a 1-Click Testnet Playground launcher and plain-English XRPL Reserve & Destination Tag cheat sheet.
  - Live **XRPL Protocol Amendment Voting Radar** inside `Validator Constellation` tracking pending & enabled amendments with visual 80% supermajority progress bars.
- **60fps Command Deck Performance Overhaul:**
  - Eliminated per-transaction Rust sidecar RPC calls via O(1) synchronous `trackedAddresses` cache, decoupled 60fps canvases onto a zero-React-overhead visual event bus (`streamVisualBus.ts`), batched Zustand UI commits to ~6.5 Hz, cached static pipeline layers & radial glow gradients, added delta-time (`dt`) physics, and added a 25s dead-socket failover watchdog.

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
