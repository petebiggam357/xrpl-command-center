# Changelog

All notable changes to **XRPL Command Center** are documented in this file.

## [0.2.9-beta] - 2026-11-27

### Added
- **Post-Quantum Cryptography (PQC) Exposure Scanner & Crypto-Agile Security Suite:**
  - Added pure Post-Quantum exposure engine `src/shared/quantumUtils.ts` (`assessQuantumExposure`) detecting whether an XRPL account's classical `SigningPubKey` is still hidden behind `SHA-256 + RIPEMD-160` (`PQ-SHIELDED`) or has been revealed by an outgoing signed transaction (`PUBKEY EXPOSED`), with live score (`0–100`) and tailored migration recommendations.
  - Added live **PQ Exposure Badge & Readiness Drawer** inside `WalletDeck` with a 1-click **`+ Create Fresh PQ-Shielded Cold Vault`** shortcut, and embedded the full **Post-Quantum Readiness & Public-Key Exposure** section into exported **Account Security & Reserve Audit (`.md`)** reports.
  - Added **SHA-512 cryptographic integrity seals (`sha512Integrity`)** to `.xrplvault` encrypted backup export/import in `electron/main.ts` (tamper-evident while remaining backward-compatible with earlier `.xrplvault` files), and added `is_post_quantum_signature()` crypto-agility hook to `rust-vault/src/xrpl_crypto.rs`.
  - Added **XRPL Academy Lesson #12** (*Post-Quantum Cryptography on XRPL & Quantum-Shielded Cold Storage*) and a **6th Interactive 60fps Animation** (*Post-Quantum Shield vs. Shor's Algorithm* with interactive `Cold Vault` / `Spent ECC` / `PQ RegularKey` toggle).
- **Verification:** Added `tests/quantumReadiness.test.ts` (6 new unit tests; **100/100** total Vitest tests passing across 18 suites + all Rust vault tests passing).

## [0.2.8-beta] - 2026-11-27

### Added
- **5 Interactive 60fps Visual Protocol Explainers (`XRPL Academy → Interactive Animations`):**
  - Added `InteractiveExplainers.tsx` with Play/Pause, Restart, and interactive stress-test controls covering:
    1. **Consensus & 80% UNL Quorum** (`OPEN → ESTABLISH → 80% QUORUM → VALIDATED`)
    2. **Fee Escalation & Open-Ledger Queue** (interactive `1x–1000x` load slider + **Try 945x Spike!** preset)
    3. **CLOB DEX + XLS-30 AMM Auto-Bridging** (hybrid liquidity particle flow)
    4. **XLS-65 Single Asset Vaults & XLS-66 First-Loss Cover** (interactive **Trigger Default Shock!** waterfall demo)
    5. **Local Docker Node Sync & Stock Mode** (P2P mesh, dual dUNL, NuDB snapshot & `full` state)
- **Live Screenshot Gallery, Animated README Tour GIF & 1080p Launch Promo Video:**
  - Added automated Electron screenshot capture pipeline (`scripts/capture-screenshots.mjs`) capturing 8 real `1440×900` module screenshots in `docs/media/screenshots/` (with clean showcase data and zero personal keys/PII).
  - Added `scripts/build-explainer-media.py` generating `docs/media/xrpl-command-center-promo.mp4` (1920×1080 30fps launch video with smooth cross-fades & callout lower-thirds) and `docs/media/xrpl-command-center-tour.gif` embedded directly in `README.md`.

## [0.2.7-beta] - 2026-11-26

### Added & Improved
- **Smart Cross-Module Handoffs (Zero Copy-Pasting):**
  - **Tokens & DEX → Wallets:** Clicking **Swap / Provide LP →** automatically switches to `Wallets & DeFi` (`Pro DEX & AMM`) and pre-fills that exact token's currency & issuer.
  - **Inspector Drawer → Wallets & External Explorers:** Added 1-click **Send** button on inspected accounts (pre-fills destination in `Wallets & DeFi → Send`) plus network-aware **XRPScan / Bithomp / Testnet / Devnet** external links.
  - **RPC & Replay:** Added 1-click **Use Active Wallet** button to inject the selected wallet address straight into JSON-RPC presets.
- **Node Health Doctor, 5-Stage Sync Tracker & Auto-Detecting Docker Log Tailer (`My Node Ops`):**
  - Added automatic **Node Health Doctor** (`diagnoseNodeHealth`) with a 5-stage `disconnected → connected → syncing → tracking → full` bar and actionable diagnostics for Docker RPC reachability, NTP/validator-list sync stalls, peer counts, and disk I/O latency.
  - Fixed `Local Log Tailer` `ENOENT` on `/var/log/rippled/debug.log` for Docker installs: `nodeOps:readLogTail` now automatically falls back to the managed Docker node's `data/log/debug.log` or live `docker logs`, plus a 1-click **Use Docker Log** button.
- **Grouped Sidebar Navigation, `Alt+1`…`Alt+9` Shortcuts & Crash-Proof `DeckErrorBoundary`:**
  - Organized the 13 modules into 3 scannable sidebar groups (**Observe & Telemetry**, **DeFi & Studios**, **Operate & Learn**), added `Alt+1`…`Alt+9` quick-jump shortcuts, and wrapped every lazy-loaded deck in `DeckErrorBoundary` with 1-click **Reload Module** recovery.
- **Verification:** Added `tests/v027Polish.test.ts` (4 new unit tests; **94/94** total Vitest tests passing across 17 suites).

## [0.2.6-beta] - 2026-11-26

### Added
- **XLS-65 Single Asset Vaults & XLS-66 Native Lending Protocol Studio (`Vaults & Lending` tab + `Ctrl+K` quick-jump):**
  - Added lazy-loaded `VaultLendingDeck` and pure engine `src/shared/vaultLendingUtils.ts` with a live **Amendment Readiness Banner** tracking real-time validator voting support for `SingleAssetVault` (`XLS-65`) and `LendingProtocol` (`XLS-66`) plus 1-click Devnet testing.
  - Extended `WalletTxIntent` and `WalletVaultService` with native **`VaultCreate`** (Public or XLS-80 Permissioned Domain), **`VaultDeposit`**, **`VaultWithdraw`**, **`LoanBrokerSet`** (management fee, debt cap, first-loss cover min/liquidation %), and **`LoanPay`** transaction builders flowing through `TxConfirmModal`.
  - Added live on-ledger **`vault_info`** and **`ledger_entry`** inspectors for active Vault IDs, Loan Brokers, and Loans.
  - Added an interactive **Yield & First-Loss Cover Waterfall Simulator** (`simulateVaultYieldAndWaterfall`) modeling depositor APY vs. simulated borrower default shocks to show how Loan Broker First-Loss Cover shields regular depositors.
- **XRPL Academy Lesson #11:** Added a dedicated lesson on **XLS-65 Single Asset Vaults & XLS-66 Native Lending Protocol** with a direct **Open Vaults & Lending** CTA.
- **Verification:** Added `tests/vaultLending.test.ts` (6 new unit tests; **90/90** total Vitest tests passing across 16 suites).

## [0.2.5-beta] - 2026-11-26

### Added
- **XLS-20 NFT Studio & Collection Launchpad (`NFT Studio` tab + `Ctrl+K` quick-jump):**
  - Added lazy-loaded `NftStudioDeck` and pure engine `src/shared/nftStudioUtils.ts` supporting both **Single 1-of-1 Minting** and **Collection Batch Minting** (`1–500` items).
  - **XLS-24d Metadata Builder, Live Marketplace Card Preview & Preflight Linter:** Build standards-compliant XLS-24d JSON with custom traits, preview IPFS artwork live, validate XRPL's 256-byte URI limit, `tfTransferable` / `tfBurnable` / `tfOnlyXRP` flags (extended in `WalletVaultService`), and royalty (`TransferFee`) rules before minting.
  - **Collection Batch Minter & XLS-20 `NFTokenPage` Reserve Calculator:** Supports sequential IPFS CIDs (`ipfs://<CID>/1.json`…`N.json`) or CSV + Traits manifests, computes exact 16–32 NFT/page reserve costs + optional offer reserves, exports XLS-24d metadata bundles for IPFS pinning, runs sequential batch minting with abort controls, and exports Mint Receipt CSVs.
  - **Trait Rarity & Distribution Analyzer + Post-Mint Bulk Sell-Offer & Whitelist Airdrop Queue:** Analyzes trait frequencies, Mythic/Legendary/Rare/Common rankings, and duplicate/uniform trait warnings, plus queues fixed-price `NFTokenCreateOffer` listings or `0 XRP` destination-locked whitelist NFT airdrops.
  - **Creator Playbook ("What Sells Best on XRPL"):** Curated category breakdown (Utility Passes, Gaming Assets, Phygital/RWA, 1-of-1 Fine Art, Tight-Supply PFPs) with supply/royalty/pricing benchmarks and a persisted 6-step Pre-Launch Checklist.
- **Verification:** Added `tests/nftStudio.test.ts` (8 new unit tests; **84/84** total Vitest tests passing across 15 suites).

## [0.2.4-beta] - 2026-11-26

### Added
- **Track 1 — Live XRPL Mempool & Open-Ledger Fee-Pressure Radar (`Command Deck`):**
  - Added `MempoolRadarPanel` polling `fee` RPC every 8s alongside real-time unvalidated (`transactions_proposed`) stream events to display live Open-Ledger Fee, Median Fee, Open-Ledger Load %, Escalation Queue Fill %, pending whale badges, and an expandable click-to-inspect pending queue.
- **Track 2 — XLS-30 AMM Impermanent Loss & LP Yield Simulator (`Tokens & DEX`):**
  - Added interactive constant-product (`x·y=k`) Impermanent Loss & LP Fee Yield Simulator (`simulateAmmLpYield`) inside `TokenExplorer` with Deposit, Price Move (`-80%` to `+400%`), 24h Pool Volume, and Holding Horizon sliders projecting IL %, Est. APR %, Net vs. HODL (XRP), and Break-Even Days.
- **Track 3 — Streaming Payment Channels Studio & RegularKey Rotation (`Wallets & DeFi`):**
  - Extended `WalletTxIntent` and `WalletVaultService` with native `PaymentChannelCreate`, `PaymentChannelFund`, and `SetRegularKey` transaction builders.
  - Added **Streaming Payment Channels** studio (`Escrows, Checks & NFTs` sub-tab) with live `account_channels` viewer and 1-click channel top-up, plus **RegularKey Rotation & Key Hygiene** (`Multi-Sig` sub-tab) with blackhole address safety guards.
- **Track 4 — Interactive Account Fund-Flow Graph (`InspectorDrawer`):**
  - Added a radial SVG **Account Fund-Flow & Counterparty Graph** (`buildAccountFlowGraph`) inside the Account Inspector showing directional inbound/outbound/bidirectional XRP volume edges with Address Book label resolution and click-to-hop navigation into any counterparty account.
- **Verification:** Added `tests/v024PowerSuite.test.ts` (6 new unit tests; **76/76** total Vitest tests passing across 14 suites).

## [0.2.3-beta] - 2026-11-26

### Added
- **Track 1 — XRPL Developer RPC Console & Ledger Time Machine (`RPC & Replay` tab + `Ctrl+K` quick-jump):**
  - Added lazy-loaded `DevRpcDeck` featuring an interactive JSON-RPC / WebSocket Playground with 8 one-click `rippled` presets (`server_info`, `fee`, `account_info`, `account_objects`, `amm_info`, `book_offers`, `gateway_balances`, `ledger_entry`), live JSON parameter validation, `Ctrl+Enter` execution, latency badge, copyable formatted output, and persisted local query history.
  - Added **Ledger Time Machine** to load any historical validated ledger index (with `-1000`, `-100`, `-10`, `-1`, `+1`, `+10`, `Latest` step controls), inspect close time, total XRP supply, and click any historical transaction to open `InspectorDrawer`.
- **Track 2 — Live CLOB vs. AMM Spread & Liquidity Radar (`Tokens & DEX`):**
  - Added live `computeClobVsAmmSpread` comparison card inside `TokenExplorer` displaying CLOB Mid-Price vs. XLS-30 AMM Spot Price side-by-side, spread percentage, LP trading fee (bps), net arbitrage edge, cheaper venue indicator, and a 1-click **Swap / Provide LP** handoff.
- **Track 3 — Multi-Tranche Escrow Vesting Builder & Account Security Audit Report (`Wallets & DeFi`):**
  - Added **Multi-Tranche Escrow Vesting Schedule Builder** in `WalletDeck` (`Escrows, Checks & NFTs` sub-tab) generating 2–24 exact drop-balanced `EscrowCreate` tranches (Weekly / Bi-Weekly / Monthly / Quarterly) with reserve & fee estimates and per-tranche `TxConfirmModal` signing.
  - Added 1-click **Security Audit (.md)** export (`wallet:exportSecurityAudit` IPC + browser download fallback) generating a redacted Markdown report of account flags (`Blackholed`, `DefaultRipple`, `RequireDestTag`, `GlobalFreeze`, `NoFreeze`, `AllowClawback`), Multi-Sig quorum, owned objects, and zero-balance TrustLine reserve optimization hints.
- **Track 4 — Open-Source Public-Launch Readiness & Cryptographic Release Checksums:**
  - Added `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/` (`bug_report.md`, `feature_request.md`), and `.github/PULL_REQUEST_TEMPLATE.md`.
  - Updated `.github/workflows/build.yml` to automatically generate per-platform SHA-256 checksum manifests (`SHA256SUMS-linux.txt`, `SHA256SUMS-win.txt`, `SHA256SUMS-mac.txt`) and attach them to every GitHub Release.
- **Verification:** Added `tests/v023PowerSuite.test.ts` (7 new unit tests; **70/70** total Vitest tests passing across 13 suites).

## [0.2.2-beta] - 2026-11-26

### Added
- **Track 1 — Deep Performance, Zero-Flicker 3D Globe & Rust Sidecar Auto-Restart:**
  - Decoupled live topology/validator node updates from Three.js WebGL renderer setup in `ValidatorGlobe3D` so live refreshes update GPU buffers in-place with zero WebGL teardown, zero flicker, and preserved camera orbit.
  - Added `document.hidden` render pause in `ValidatorGlobe3D` for low-CPU background operation.
  - Added bounded exponential-backoff auto-restart and `getHealth()` telemetry in `RustVaultSidecarClient` (`electron/rustVaultClient.ts`).
- **Track 2 — Batch Airdrop & Multi-Recipient Payout Studio (`Token Launcher` deck):**
  - Added `BatchAirdropPanel` supporting CSV/TSV upload or paste (`r-address,amount[,destination_tag]`) for native XRP and issued IOU payouts with pre-flight validation, sequential queued signing, progress bar, abort control, and downloadable receipt CSV (`buildPayoutReceiptCsv`).
- **Track 3 — XRPL Transaction Dry-Run Simulator & Balance-Delta Preview (`TxConfirmModal`):**
  - Added deterministic pre-flight `simulateTxDryRun` preview inside `TxConfirmModal` projecting `tesSUCCESS` / `tecUNFUNDED_PAYMENT` / `tecINSUFFICIENT_RESERVE` / `tecDST_TAG_NEEDED`, exact XRP delta, reserve delta, and affected ledger objects.
- **Track 4 — Wallet Portfolio Groups & Widescreen Focus Mode (`Wallets` + `TopHudBar`):**
  - Added persistent wallet portfolio group tags (`Cold Storage`, `DeFi Hot`, `Issuer / Treasury`, `Testnet`, `General`) with per-group XRP + USD totals and instant group filtering in `WalletDeck`.
  - Added Full-Bleed Widescreen Focus Mode (collapsible sidebar toggle button in `TopHudBar` + `Ctrl+B` / `Cmd+B` keyboard shortcut).
- **Verification:** Added `tests/v022OptimizationAndStudio.test.ts` (13 new unit tests; **63/63** total Vitest tests passing across 12 suites).

## [0.2.1-beta] - 2026-11-26

### Added
- **XRPL Token Launcher & Guided 5-Step Wizard (`Token Launcher` tab + `Ctrl+K` quick-jump):**
  - Supports both **Classic XRPL IOUs** (Issuer + Distributor two-wallet architecture) and **XLS-33 Multi-Purpose Tokens (`MPT`)** with 1-click presets (`Community / Meme Token`, `Regulated Stablecoin / RWA`, `Institutional MPT`).
  - Live currency code validation & canonical 3-char / 160-bit 40-hex encoding (`validateCurrencyCode`), `TransferRate` (`0–100%`) and `TickSize` (`0` or `3–15`) encoding, and distinct-wallet safety guards for IOU issuance.
  - Extended `AccountSet` transaction builder in `WalletVaultService` to support `TransferRate`, `TickSize`, `asfNoFreeze` (`SetFlag: 6`), and `asfRequireAuth` (`SetFlag: 2`) alongside `asfDefaultRipple`, `asfRequireDest`, `asfAllowTrustLineClawback`, and `Domain`.
  - Optional **XLS-30 AMM Liquidity Pool** seeding (`AMMCreate`) with live initial price, tokens/XRP, and implied FDV (XRP + USD) preview, plus live `/.well-known/xrp-ledger.toml` generation & linting.
  - Itemized XRP reserve & network fee estimator and step-by-step on-ledger execution checklist integrated directly with `TxConfirmModal` (Rust Vault, Ledger USB, Air-Gapped QR, Multi-Sig).
- **Verification:** Added `tests/tokenLauncher.test.ts` (8 new unit tests; **50/50** total Vitest tests passing across 11 suites).

## [0.2.0-beta] - 2026-11-25

### Added
- **Track 1 — Portfolio Charts, Asset Allocation & Tax-Ready CSV (`Wallets` + `Analytics`):**
  - Persisted rolling multi-wallet net worth snapshots (`portfolioHistory`) with an inline SVG trend sparkline and XRP vs. IOU **Asset Allocation** bar in `Analytics`.
  - Added 1-click **Tax CSV (CoinTracker / Koinly)** export (`analyticsExportTaxCsv`) formatting the local SQLite wallet transaction journal into RFC-4180 tax-ready columns.
- **Track 2 — In-Place DEX/AMM Quick-Trade & Price Target Alerts (`Tokens & DEX`):**
  - Added 1-click **Quick Trade** handoff from any inspected token directly into the Wallets & DeFi Studio swap/orderbook flow.
  - Added local **XRP/USD Price Target Alerts** (`above`/`below`) evaluated live against the market ticker with instant HUD alert notifications.
- **Track 3 — Live Fee Escalation Meter, 5-Min Trending Tokens & 3D Globe Focus (`Command Deck` + `3D Globe`):**
  - Added a live **Fee Escalation Meter** (`low` / `elevated` / `high`) and **5-Minute Trending Tokens** strip in the `LedgerRibbon`.
  - Added **Click-to-Focus Validator Hub Chips** in `ValidatorGlobe3D` with smooth camera/globe slew to major XRPL topology hubs.
- **Track 4 — HUD Themes, Custom Auto-Lock Timer & Redacted Diagnostics (`Analytics / Settings`):**
  - Added 4 selectable **HUD Themes** (`Cyber Cyan`, `Emerald Matrix`, `Solar Amber`, `Midnight High-Contrast`) applied globally via CSS variables.
  - Added configurable **Vault Auto-Lock Timer** (`5m / 15m / 30m / 60m`) synced to the Electron main-process vault timer.
  - Added 1-click **Redacted Diagnostics Export** (`systemExportDiagnostics`) that strips any accidental Ed25519 (`sEd...`) or secp256k1 (`s...`) XRPL family seeds before saving.
- **Verification:** Added `tests/v020Features.test.ts` (8 new unit tests; **37/37** total Vitest tests passing).

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
