<div align="center">

<img src="build/icon.svg" alt="XRPL Command Center Logo" width="112" height="112" />

# XRPL Command Center

**Real-Time Cross-Platform XRP Ledger Telemetry, 3D Consensus Globe, Encrypted Multi-Wallet & Pro DeFi Studio, Institutional Primitives (`MPT`/`Oracle`/`DID`), 1-Click Docker Node Manager & SQLite Analytics**

[![Version](https://img.shields.io/badge/version-v0.2.10--beta-22d3ee?style=flat-square)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/platforms-AppImage%20%7C%20exe%20%7C%20dmg-34d399?style=flat-square)](#cross-platform-packaging)
[![Security](https://img.shields.io/badge/vault-Rust%20Argon2id%20%2B%20Ledger%20%2B%20Trezor%20%2B%20Cold%20QR-a78bfa?style=flat-square)](#security--vault-architecture)
[![License](https://img.shields.io/badge/license-MIT-64748b?style=flat-square)](LICENSE)

</div>

---

## Overview

**XRPL Command Center** is a cross-platform desktop application (Linux `.AppImage`, Windows `.exe`, macOS `.dmg`) engineered to make the live **XRP Ledger** visually tangible in real time—combining a 60fps consensus & transaction visualization engine, a guided 5-step **Token Launcher & Wizard** (IOU + AMM & XLS-33 MPT), an **XLS-20 NFT Studio & Collection Launchpad**, an amendment-aware **XLS-65 Single Asset Vault & XLS-66 Lending Studio**, an encrypted Rust Argon2id multi-wallet & hardware/multi-sig DeFi studio, a Pro DEX pathfinding & AMM IL simulator, institutional `MPT`/`Oracle`/`DID` tools, a 1-click Docker `rippled` node manager with `rippled.cfg` diff studio, and embedded SQLite analytics with CoinTracker/Koinly tax CSV export.

<div align="center">

![XRPL Command Center Animated Feature Tour](docs/media/xrpl-command-center-tour.gif)

*Full 1080p Launch Promo Video: [`docs/media/xrpl-command-center-promo.mp4`](docs/media/xrpl-command-center-promo.mp4)*

</div>

### Visual Screenshot Tour

| Command Deck (Consensus, Particle River & Mempool) | Wallets & Pro DeFi Studio (Rust Argon2id Vault) |
| :---: | :---: |
| ![Command Deck](docs/media/screenshots/01-command-deck.png) | ![Wallets & DeFi](docs/media/screenshots/02-wallets-defi.png) |

| 3D Holographic Continent Consensus Globe | Tokens, DEX Spread Radar & XLS-30 AMM IL Simulator |
| :---: | :---: |
| ![3D Continent Globe](docs/media/screenshots/03-3d-globe.png) | ![Tokens & AMM](docs/media/screenshots/04-tokens-dex-amm.png) |

| XLS-20 NFT Studio & Collection Launchpad | XLS-65 Vaults & XLS-66 First-Loss Waterfall |
| :---: | :---: |
| ![NFT Studio](docs/media/screenshots/05-nft-studio.png) | ![Vaults & Lending](docs/media/screenshots/06-vaults-lending.png) |

| My Node Ops, Node Health Doctor & 1-Click Docker | XRPL Academy — 6 Interactive 60fps Animations |
| :---: | :---: |
| ![Node Ops](docs/media/screenshots/07-node-ops.png) | ![XRPL Academy Animations](docs/media/screenshots/08-xrpl-academy-animations.png) |

---

## Core Modules

| Module | What You See & Control |
| :--- | :--- |
| **Command Deck** | 60fps delta-time HTML5 Canvas **Live Consensus Core** (`OPEN → ESTABLISH → 80% QUORUM → VALIDATED`), 6-lane **Transaction Particle River**, **Live Mempool & Open-Ledger Fee-Pressure Radar** (real-time pre-consensus pending queue, escalation meter & pending whales), **Whale Radar** (with optional WebAudio synth chime), scrolling **Validated Ledger Chain**, **Live Fee Escalation Meter** & **5-Min Trending Tokens**, live **XRP/USD HUD Ticker**, toggleable **Live FPS / Latency / Heap Perf HUD**, **Saved Custom Node Endpoint Profiles**, and click-to-inspect live transaction tape with **Interactive Account Fund-Flow Graph** in the Inspector Drawer. |
| **3D Holographic Globe** | Lazy-loaded interactive **Three.js WebGL2** validator & peer topology globe rendered with offline equirectangular **world continents & coastlines**, drag-to-orbit, zoom, **Click-to-Focus Validator Hub Chips**, **click-to-inspect right-side Node Details drawer** (location, pubkey, domain, version, peers, uptime & agreement), and live geodesic arcs pulsing on consensus & transaction activity. |
| **Validator Constellation** | Live XRPLF Validator History Service (`data.xrplf.org`) metrics, UNL filters, 1h / 24h / 30d agreement scores, `rippled` version breakdown, live `validationReceived` vote pulses, and **XRPL Amendment Voting Radar** (80% activation progress). |
| **Tokens, DEX & AMM Explorer** | **Pro Interactive OHLCV Trading Charts & Technical Indicators** (`XRP/USD` via Kraken/Coinbase OHLC + live XRPL DEX `<TOKEN>/XRP` via OnTheDEX; **Candlesticks**, **Heikin-Ashi**, **Area**, `15m`/`1H`/`4H`/`1D` timeframes, **EMA 9/21/50**, **SMA 20**, **Bollinger Bands (20,2)**, **VWAP**, **Volume**, synchronized **RSI (14)** & **MACD (12,26,9)** sub-panes, zoom/pan, crosshair & plotted XRP Price Alert lines), global XRPL token index (`s1.xrplmeta.org`) + **authoritative on-ledger verification** (`account_info`, `gateway_balances`, `book_offers`, `amm_info`), issuer risk flags (`Blackholed`, `GlobalFreeze`, `NoFreeze`, `Clawback`), **Live CLOB vs. AMM Spread Radar**, interactive **XLS-30 AMM Impermanent Loss & LP Yield Simulator**, **60fps CLOB Depth Wall + AMM `x·y=k` Curve Canvas**, **In-Place DEX/AMM Quick-Trade**, and **XRP/USD Price Target Alerts**. |
| **Token Launcher & Batch Airdrop** | Guided 5-step **XRPL Token Launcher** supporting **Classic XRPL IOUs** (Issuer + Distributor two-wallet architecture) and **XLS-33 Multi-Purpose Tokens (`MPT`)**, 1-click presets (`Community / Meme`, `Regulated RWA`, `Institutional MPT`), live 3-char / 160-bit 40-hex currency validation, `TransferRate` & `TickSize` encoding, governance flags (`DefaultRipple`, `Clawback`, `RequireAuth`, `NoFreeze`), optional **XLS-30 AMM Liquidity Pool** seeding, live **`xrp-ledger.toml`** generation & linting, and **CSV Batch Airdrop Studio** with downloadable receipt CSV. |
| **XLS-20 NFT Studio & Launchpad** | End-to-end **1-of-1 & Collection NFT Launchpad** with an **XLS-24d Metadata Builder & Preflight Linter** (enforces XRPL's 256-byte URI limit, IPFS immutability, `tfTransferable`/`tfBurnable`/`tfOnlyXRP` flags & royalties), **Live Marketplace Card Preview**, **Collection Batch Minter** (sequential IPFS CIDs or CSV + Traits) with exact **XLS-20 `NFTokenPage` Reserve & Cost Calculator**, **Trait Rarity & Distribution Analyzer**, **Post-Mint Bulk Sell-Offer & 0-XRP Whitelist Airdrop Queue**, and an interactive **Creator Playbook ("What Sells Best on XRPL")**. |
| **XLS-65 Vaults & XLS-66 Lending** | Amendment-aware **Single Asset Vault (`XLS-65`) & Native Lending Protocol (`XLS-66`) Studio** with live validator activation status badges, native `VaultCreate` (Public or XLS-80 Permissioned Domain), `VaultDeposit`, `VaultWithdraw`, `LoanBrokerSet`, and `LoanPay` transaction builders, live on-ledger `vault_info` / `ledger_entry` inspectors, and an interactive **Yield & First-Loss Cover Waterfall Simulator**. |
| **Wallets & Pro DeFi Studio** | Process-isolated **Rust Argon2id + AES-256-GCM (128-bit PQ-Safe) + Zeroize Vault**, **Live Post-Quantum Public-Key Exposure Scanner** (`PQ-SHIELDED` vs. `PUBKEY EXPOSED` + 1-click fresh cold vault creation), **SHA-512 Integrity-Sealed `.xrplvault` Backup/Restore**, **Offline Printable Cold Recovery Sheet**, **1-Click Account Security & Reserve Audit (.md)** (with Post-Quantum score), configurable **Auto-Lock Timer (`5m/15m/30m/60m`)**, **Multi-Wallet Combined Net Worth & Portfolio Groups**, **Dry-Run Tx Simulator & Balance-Delta Preview**, **Open-SDK Hardware & Cold Wallet Hub** (**Ledger WebHID USB**, **Trezor Suite Bridge / WebUSB**, **Keystone 3 Pro**, **Tangem**, **D'CENT / Ellipal**, **Xaman**), **Smart Address Book & Exchange Destination-Tag Guard**, **X-Address decode**, **Multi-Tranche Escrow Vesting Schedule Builder**, **Streaming Payment Channels (`PaymentChannelCreate` / `Fund`)**, **RegularKey Rotation (`SetRegularKey`)**, **Visual NFT Gallery**, **Air-Gapped QR**, **Native Multi-Sign**, **Smart Pathfinding Swap**, `OfferCreate`/`Cancel`, `AMMCreate`/`AMMVote`/`Deposit`/`Withdraw`, Escrows, Checks, and **1-Click Testnet Playground**. |
| **Institutional Studio** | Issue **Multi-Purpose Tokens (`MPTokenIssuanceCreate`, `MPTokenAuthorize`)**, manage regulated **`Clawback` (`XLS-39`)**, generate & lint **`xrp-ledger.toml`** with 1-click `AccountSet` domain linking, query & publish **XLS-47 Price Oracles (`get_aggregate_price` / `OracleSet`)**, and resolve/anchor **XLS-40 W3C DIDs (`DIDSet`)**. |
| **RPC Console & Time Machine** | Interactive **XRPL JSON-RPC / WebSocket Playground** with 8 one-click `rippled` presets (`server_info`, `fee`, `account_info`, `account_objects`, `amm_info`, `book_offers`, `gateway_balances`, `ledger_entry`), live JSON validation, latency readout & saved query history, plus a **Ledger Time Machine** to jump to or step across any historical validated ledger (`-1000` to `+10` / `Latest`) and click-to-inspect past transactions. |
| **My Node Ops & Docker** | **1-Click Cross-Platform Docker `xrpld` Launcher** (Mainnet/Testnet/Devnet, loopback-only host admin `127.0.0.1:5005`), **Automatic Node Health Doctor & 5-Stage Sync Tracker** (`disconnected → connected → syncing → tracking → full` with NTP/peer/I/O diagnostics), **Custom Storage Drive & Folder Picker** (store multi-GB/TB `NuDB`/`RocksDB` ledger history on any internal NVMe or external SSD with live free-space monitoring), **Visual `rippled.cfg` & `validators.txt` Diff Studio** with timestamped `.bak` auto-backups, SSH-tunneled admin telemetry, and **Auto-Detecting Local/Docker Log Tailer**. |
| **Analytics, Themes & Diagnostics** | Embedded **WebAssembly SQLite (`command-center.sqlite`)** recording ledger throughput & tracked wallet transaction journals, **Portfolio Net Worth Trend & Asset Allocation**, **1-click CoinTracker/Koinly Tax CSV** & raw CSV export, **4 HUD Themes** (`Cyber Cyan`, `Emerald Matrix`, `Solar Amber`, `Midnight High-Contrast`), **Custom Vault Auto-Lock (`5m/15m/30m/60m`)**, **Redacted Diagnostics Export** (auto-strips XRPL seeds), **OS System Tray Mode**, **30s Background Node Watchdog**, and `electron-updater` release checks. |
| **XRPL Academy (Education)** | Built-in interactive XRP Ledger & Command Center education hub with **12 deep lessons** (including Post-Quantum Cryptography on XRPL, XLS-65 Single Asset Vaults & XLS-66 Native Lending Protocol, Consensus/UNL, Reserves, Destination Tags/X-Addresses, TrustLines, CLOB + XLS-30 AMM, Escrows/Checks/NFTs, Rust Vault & Hardware Custody, Institutional MPT/Oracles/DIDs, Self-Hosted Nodes & Command Center Tour), **6 Interactive 60fps Visual Protocol Animations** (Consensus Quorum, Fee Escalation 1x–1000x, CLOB+AMM Auto-Bridging, XLS-65/66 Default-Shock Waterfall, Local Docker Node Sync & Post-Quantum Shield vs. Shor's Algorithm), **mastery progress tracking**, **Interactive Reserve & Fee Simulator**, **20-term searchable XRPL Glossary**, and **12 curated official XRPL docs & explorer links**. |

---

## System Architecture

```mermaid
flowchart LR
  subgraph EXT["XRPL Network, Docker, Storage & Hardware"]
    PUB["XRPL WS Clusters (Mainnet / Testnet / Devnet)"]
    VHS["XRPLF VHS, XRPL Meta, XRPScan & Spot Price APIs"]
    DOCKER["Local Docker Engine (xrpld Container)"]
    DRIVE["Custom Storage Drive (Internal NVMe / External SSD)"]
    HW["Ledger WebHID, Trezor Bridge/WebUSB, Keystone/Tangem/Xaman Cold QR"]
  end

  subgraph RUST["Process-Isolated Rust Sidecar (Zero Network)"]
    RV["xrpl-vault-sidecar (Argon2id + AES-256-GCM + Zeroize)"]
  end

  subgraph MAIN["Electron Main Process (Isolated Security Boundary)"]
    STREAM["Resilient WS Failover Pool + 25s Stall Watchdog"]
    VAULT["Vault Orchestrator + X-Address + .xrplvault Backup"]
    DOCKSVC["DockerNodeService + Drive Picker + Config Diff"]
    SQL["SQLite Analytics (sql.js) + CSV Export"]
    TRAY["System Tray Watchdog + AutoUpdater"]
  end

  subgraph UI["Renderer Cockpit (React + TS + 60fps Canvas2D + Three.js)"]
    DECK["Command Deck + 3D Globe + Validators/Amendments + Tokens"]
    WALLET["Token Launcher Wizard + Wallets, PathSwap, AMM Curve & NFTs"]
    PRIM["Institutional (MPT, Oracles, DID, TOML)"]
    NODE["My Node Ops + Docker + Analytics"]
  end

  PUB --> STREAM
  VHS --> STREAM
  DOCKER --> DOCKSVC
  DRIVE --> DOCKSVC
  HW --> WALLET
  RV <--> VAULT
  STREAM --> SQL
  STREAM --> TRAY
  VAULT --> STREAM
  STREAM --> DECK
  STREAM --> WALLET
  STREAM --> PRIM
  DOCKSVC --> NODE
  SQL --> NODE
```

---

## Quick Start

### Option 1: Launch a Packaged Release (`v0.2.10-beta`)

Download the package for your operating system from the **Releases** page:

- **Linux (`.AppImage`):**
  ```bash
  chmod +x XRPL-Command-Center-0.2.10-beta-linux-x86_64.AppImage
  ./XRPL-Command-Center-0.2.10-beta-linux-x86_64.AppImage
  ```
  > **Ubuntu / Debian tip:** If AppArmor user-namespace restrictions or missing FUSE2 prevent direct launch, run with `--appimage-extract-and-run --no-sandbox`. On first AppImage launch, the desktop dock icon is automatically registered in `~/.local/share/icons` and `~/.local/share/applications`.
- **Windows (`.exe`):** Run `XRPL-Command-Center-0.2.10-beta-win-x64-setup.exe` (installer) or `XRPL-Command-Center-0.2.10-beta-win-x64-portable.exe` (standalone portable binary).
- **macOS (`.dmg`):** Open `XRPL-Command-Center-0.2.10-beta-mac-arm64.dmg` (Apple Silicon) and drag **XRPL Command Center** to Applications.

#### Verify Release Checksums (SHA-256)

Every release attaches per-platform SHA-256 manifests (`SHA256SUMS-linux.txt`, `SHA256SUMS-win.txt`, `SHA256SUMS-mac.txt`) so you can cryptographically verify your download before running:

```bash
# Linux (Ubuntu / Debian)
sha256sum -c SHA256SUMS-linux.txt

# macOS
shasum -a 256 -c SHA256SUMS-mac.txt

# Windows (PowerShell)
Get-FileHash .\XRPL-Command-Center-0.2.10-beta-win-x64-setup.exe -Algorithm SHA256
```

### Option 2: Run From Source (Development)

**Prerequisites:** Node.js `>=18.19` (Node 20 LTS recommended), `npm`, and Rust (`cargo` / `rustc`) for compiling the native vault sidecar.

```bash
npm install
npm run build:rust
npm run dev
```

### Verification & Tests

```bash
cargo test --manifest-path rust-vault/Cargo.toml  # Rust Argon2id + ed25519/secp256k1 unit tests
npm run typecheck                                 # Strict TS checks for renderer & Electron
npm test                                          # 108 Vitest tests across 19 suites
npm run build                                     # Vite + esbuild + staged Rust sidecar
```

---

## Managing Your Own `rippled` / Clio Node

Open **My Node Ops** in the left navigation rail:

1. **Choose a Storage Drive / Folder:** In **1-Click Docker Node**, click **Browse Drive / Folder…** to pick any fast internal NVMe, secondary hard drive, or external SSD for your `NuDB` / `RocksDB` ledger database. Free disk space is checked live (`fs.statfs`) with low-space warnings (`< 30 GB`).
2. **1-Click Local Docker Node:** Pick Network (`Mainnet` / `Testnet` / `Devnet`), Hardware Sizing (`16 GB` / `32 GB` / `64 GB+`), and Backend (`NuDB` / `RocksDB`), then click **Provision & Launch**. Admin RPC (`127.0.0.1:5005`) and WS (`127.0.0.1:6006`) are bound strictly to loopback.
3. **Visual `rippled.cfg` Diff Studio:** Edit `rippled.cfg` and `validators.txt` with live red/green unified line diffs and automatic timestamped `.bak` backups before saving.
4. **Remote VPS (Secure SSH Tunnel):**
   ```bash
   ssh -N -L 5005:127.0.0.1:5005 -L 6006:127.0.0.1:6006 user@your-xrpl-node
   ```
   Leave the app pointed at `http://127.0.0.1:5005`, click **Poll Node**, or enable the **30s Background Node Watchdog** under **Analytics & Tray**.

---

## Cross-Platform Packaging

```bash
npm run dist:linux   # -> release/XRPL-Command-Center-0.2.10-beta-linux-x86_64.AppImage
npm run dist:win     # -> release/XRPL-Command-Center-0.2.10-beta-win-x64-{setup,portable}.exe
npm run dist:mac     # -> release/XRPL-Command-Center-0.2.10-beta-mac-arm64.dmg
```

---

## Keyboard Shortcuts & Performance

| Control | Action |
| :--- | :--- |
| `Ctrl+K` / `Cmd+K` | Open Universal Command Palette (inspect address, tx hash, ledger, or switch modules) |
| `Ctrl+B` / `Cmd+B` | Toggle Full-Bleed Widescreen Focus Mode (collapse/expand left navigation rail) |
| `Alt+1` … `Alt+9` | Instant keyboard jump between primary modules (Command, Wallets, Globe, Validators, Tokens, Launcher, NFT Studio, Vaults, Node Ops) |
| `Esc` | Close Command Palette, Signing Modal, Quick-Start, or Inspector Drawer |
| Top Bar **?** | Re-open the Quick-Start Guide & 1-Click Testnet Playground anytime |
| Top Bar **Volume** | Toggle optional subtle WebAudio synth ping for Whale Radar & Watchlist hits |
| Top Bar **Gauge** | Toggle live **FPS / tx/s / WS Latency / JS Heap MB** Performance HUD |
| Top Bar **Pause** | Freeze live animations while background telemetry, SQLite logging & alerts keep running |
| Top Bar **Sparkles** | Toggle **Reduced Motion** mode for low-power laptops |

- **Cold-Boot & Binary Size Optimization:** All 12 secondary decks (`3D Globe`, `Validators`, `Tokens`, `Token Launcher`, `NFT Studio`, `Vaults & Lending`, `Wallets`, `Institutional`, `RPC & Replay`, `Node Ops`, `Analytics`, `XRPL Academy`) are code-split via `React.lazy()` so startup only parses the Command Deck (~71% less startup JS), `dist-electron/main.js` is minified with `esbuild`, duplicate bundled `node_modules` are pruned from `app.asar`, and installers trim unused Chromium locales (`~108 MB` fast-mount Linux AppImage).

---

## Security & Vault Architecture

- **Process-Isolated Rust Cryptographic Vault (`rust-vault/xrpl-vault-sidecar`) & Post-Quantum Readiness:** Secret seeds are encrypted at rest in `userData/wallet-vault-rust.enc.json` (`0600` permissions) using **Argon2id** (`64 MiB, 3 iterations`) + **AES-256-GCM** (retaining **128-bit post-quantum security** against Grover's algorithm). Decrypted keys live exclusively inside the separate native Rust process in `Zeroizing` buffers that deterministically wipe RAM to `0x00` on lock, timeout, or exit—private keys never enter Node.js/V8 memory during signing, and `KeyAlgorithm` is structured for crypto-agile adoption of NIST **ML-DSA (Dilithium)** / **SLH-DSA (SPHINCS+)** via XRPL `SetRegularKey` once activated on-ledger.
- **SHA-512 Integrity-Sealed `.xrplvault` Backups & Live PQ Exposure Scanner:** Export and restore portable encrypted backups sealed with a **SHA-512 cryptographic integrity hash** (Argon2id + AES-256-GCM ciphertext only—plaintext seeds are never written to disk), audit every account for on-ledger `SigningPubKey` exposure (`PQ-SHIELDED` receive-only cold storage vs. `PUBKEY EXPOSED` classical ECC), or print an offline Cold Recovery Sheet.
- **Exchange Destination-Tag Guard & X-Address Support:** Automatically warns before sending to known exchanges (Coinbase, Kraken, Bitstamp, Binance, Uphold, KuCoin, Crypto.com) or saved tagged contacts without a Destination Tag, and natively decodes XRPL X-Addresses.
- **Hardened Electron Session:** Strict CSP, `contextIsolation: true`, `nodeIntegration: false`, renderer `sandbox: true`, top-level navigation lock (`will-navigate`), and permission denial (permitting only Ledger USB `0x2c97` over WebHID and Trezor `0x1209`/`0x534c` over WebUSB).
- **Open-SDK Hardware & Air-Gapped Signing:** Connect **Ledger** directly over WebHID (`0x2c97`), detect **Trezor** via local Trezor Suite Bridge (`127.0.0.1:21325`) or WebUSB (`0x1209`/`0x534c`), pair **Keystone 3 Pro / Tangem / D'CENT / Ellipal / Xaman** cold wallets, export unsigned canonical `tx_json` QR codes, or combine M-of-N `SignerListSet` partial multi-signatures.
- **Human-in-the-Loop Pre-Flight Gate:** Every transaction runs live `Sequence`, `Fee` cap, unfunded-reserve, and `lsfRequireDestTag` checks before presenting a network-aware (`MAINNET` high-visibility alert vs. `TESTNET`/`DEVNET`) confirmation modal.

---

## Support & Donations

**XRPL Command Center** is 100% free and open-source. If you find it useful and want to support ongoing development, you can send an optional XRP / XRPL donation to:

```text
rNTfyfJaYFbcqSwTKxNwTC322zFziC5LiE
```

*(Classic XRPL address — no Destination Tag required.)*

---

## Contributing & Security

- **Contributing Guide:** See [CONTRIBUTING.md](CONTRIBUTING.md) for local Rust + Electron dev setup, testing checklist, and PR guidelines.
- **Security Policy:** See [SECURITY.md](SECURITY.md) for responsible disclosure and release binary verification instructions.

---

## License

Licensed under the [MIT License](LICENSE).
