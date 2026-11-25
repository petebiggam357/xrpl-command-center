<div align="center">

<img src="build/icon.svg" alt="XRPL Command Center Logo" width="112" height="112" />

# XRPL Command Center

**Real-Time Cross-Platform XRP Ledger Telemetry, 3D Consensus Globe, Encrypted Multi-Wallet & Pro DeFi Studio, Institutional Primitives (`MPT`/`Oracle`/`DID`), 1-Click Docker Node Manager & SQLite Analytics**

[![Version](https://img.shields.io/badge/version-v0.0.3--alpha-22d3ee?style=flat-square)](CHANGELOG.md)
[![Platforms](https://img.shields.io/badge/platforms-AppImage%20%7C%20exe%20%7C%20dmg-34d399?style=flat-square)](#cross-platform-packaging)
[![Security](https://img.shields.io/badge/vault-Rust%20Argon2id%20%2B%20Zeroize%20%2B%20Ledger%20USB-a78bfa?style=flat-square)](#security--vault-architecture)
[![License](https://img.shields.io/badge/license-MIT-64748b?style=flat-square)](LICENSE)

</div>

---

## Overview

**XRPL Command Center** is a cross-platform desktop application (Linux `.AppImage`, Windows `.exe`, macOS `.dmg`) engineered to make the live **XRP Ledger** visually tangible in real time—combining a 60fps consensus & transaction visualization engine, an encrypted multi-wallet & hardware/multi-sig DeFi studio, a Pro DEX pathfinding & AMM curve terminal, institutional `MPT`/`Oracle`/`DID` tools, a 1-click Docker `rippled` node manager with `rippled.cfg` diff studio, and embedded SQLite analytics with CSV export.

---

## Core Modules

| Module | What You See & Control |
| :--- | :--- |
| **Command Deck** | 60fps HTML5 Canvas **Live Consensus Core** (`OPEN → ESTABLISH → 80% QUORUM → VALIDATED`), 6-lane **Transaction Particle River**, whale shockwaves, scrolling **Validated Ledger Chain**, and click-to-inspect live transaction tape. |
| **3D Holographic Globe** | Interactive **Three.js WebGL2** validator & peer topology globe with drag-to-orbit, zoom, and live geodesic arcs pulsing on consensus & transaction activity. |
| **Validator Constellation** | Live XRPLF Validator History Service (`data.xrplf.org`) metrics, UNL filters, 1h / 24h / 30d agreement scores, `rippled` version breakdown, and live `validationReceived` vote pulses. |
| **Tokens, DEX & AMM Explorer** | Global XRPL token index (`s1.xrplmeta.org`) + live-stream discovery + **authoritative on-ledger verification** (`account_info`, `gateway_balances`, `book_offers`, `amm_info`), issuer risk flags (`Blackholed`, `GlobalFreeze`, `NoFreeze`, `Clawback`), and **60fps CLOB Depth Wall + AMM `x·y=k` Curve Canvas**. |
| **Wallets & Pro DeFi Studio** | Passphrase-encrypted (`scrypt` + `AES-256-GCM` + OS Keyring) vault, **Ledger USB (WebHID)**, **Air-Gapped QR & Signed Blob Broadcaster**, **Native Multi-Sign (`SignerListSet` + `xrpl.multisign`)**, **Smart Auto-Bridging Pathfinding Swap (`ripple_path_find` + `DeliverMin`)**, `OfferCreate`/`Cancel`, `AMMCreate`/`AMMVote`/`Deposit`/`Withdraw`, Escrows, Checks, XLS-20 NFTs, and Testnet/Devnet Faucet. |
| **Institutional Studio** | Issue **Multi-Purpose Tokens (`MPTokenIssuanceCreate`, `MPTokenAuthorize`)**, manage regulated **`Clawback` (`XLS-39`)**, generate & lint **`xrp-ledger.toml`** with 1-click `AccountSet` domain linking, query & publish **XLS-47 Price Oracles (`get_aggregate_price` / `OracleSet`)**, and resolve/anchor **XLS-40 W3C DIDs (`DIDSet`)**. |
| **My Node Ops & Docker** | **1-Click Cross-Platform Docker `xrpld` Launcher** (Mainnet/Testnet/Devnet, loopback-only admin `127.0.0.1:5005`), **Visual `rippled.cfg` & `validators.txt` Diff Studio** with timestamped `.bak` auto-backups, SSH-tunneled admin telemetry (`peers`, `feature`, `can_delete`), local `debug.log` tailer, and confirmation-gated admin RPCs. |
| **Analytics, Tray & Updater** | Embedded **WebAssembly SQLite (`command-center.sqlite`)** recording ledger throughput & tracked wallet transaction journals, **1-click CSV accounting export**, **OS System Tray Mode**, **30s Background Node Watchdog**, and `electron-updater` release checks. |

---

## System Architecture

```mermaid
flowchart LR
  subgraph EXT["XRPL Network, Docker & Hardware"]
    PUB["XRPL WS Clusters (Mainnet / Testnet / Devnet)"]
    VHS["XRPLF VHS & XRPL Meta APIs"]
    DOCKER["Local Docker Engine (xrpld Container)"]
    HW["Ledger USB WebHID & Air-Gapped QR"]
  end

  subgraph MAIN["Electron Main Process (Isolated Security Boundary)"]
    STREAM["Resilient WS Failover Pool"]
    VAULT["Encrypted Vault + Multi-Sig Combiner"]
    DOCKSVC["DockerNodeService + Config Diff Studio"]
    SQL["SQLite Analytics (sql.js) + CSV Export"]
    TRAY["System Tray Watchdog + AutoUpdater"]
  end

  subgraph UI["Renderer Cockpit (React + TS + Canvas2D + Three.js)"]
    DECK["Command Deck + 3D Globe + Validators + Tokens"]
    WALLET["Wallets, PathSwap, AMM Curve & Multi-Sig"]
    PRIM["Institutional (MPT, Oracles, DID, TOML)"]
    NODE["My Node Ops + Docker + Analytics"]
  end

  PUB --> STREAM
  VHS --> STREAM
  DOCKER --> DOCKSVC
  HW --> WALLET
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

### Option 1: Launch a Packaged Release (`v0.0.3-alpha`)

Download the package for your operating system from the **Releases** page:

- **Linux (`.AppImage`):**
  ```bash
  chmod +x XRPL-Command-Center-0.0.3-alpha-linux-x86_64.AppImage
  ./XRPL-Command-Center-0.0.3-alpha-linux-x86_64.AppImage
  ```
  > **Ubuntu / Debian tip:** If AppArmor user-namespace restrictions or missing FUSE2 prevent direct launch, run with `--appimage-extract-and-run --no-sandbox`.
- **Windows (`.exe`):** Run `XRPL-Command-Center-0.0.3-alpha-win-x64-nsis.exe` (installer) or the `portable.exe` standalone binary.
- **macOS (`.dmg`):** Open the `arm64` (Apple Silicon) or `x64` (Intel) `.dmg` and drag **XRPL Command Center** to Applications.

### Option 2: Run From Source (Development)

**Prerequisites:** Node.js `>=18.19` (Node 20 LTS recommended) and `npm`.

```bash
npm install
npm run dev
```

### Verification & Tests

```bash
npm run typecheck   # Strict TS checks for both renderer & Electron main/preload
npm test            # Vitest suite (codecs, vault, Ledger APDU, AMM curve, TOML, SQLite/CSV)
npm run build       # Production Vite bundle + esbuild Electron main/preload
```

---

## Managing Your Own `rippled` / Clio Node

Open **My Node Ops** in the left navigation rail:

1. **1-Click Local Docker Node:** Open **1-Click Docker Node**, pick Network (`Mainnet` / `Testnet` / `Devnet`), Hardware Sizing (`16 GB` / `32 GB` / `64 GB+`), and Backend (`NuDB` / `RocksDB`), then click **Provision & Launch**. Admin RPC (`127.0.0.1:5005`) and WS (`127.0.0.1:6006`) are bound strictly to loopback.
2. **Visual `rippled.cfg` Diff Studio:** Edit `rippled.cfg` and `validators.txt` with live red/green unified line diffs and automatic timestamped `.bak` backups before saving.
3. **Remote VPS (Secure SSH Tunnel):**
   ```bash
   ssh -N -L 5005:127.0.0.1:5005 -L 6006:127.0.0.1:6006 user@your-xrpl-node
   ```
   Leave the app pointed at `http://127.0.0.1:5005`, click **Poll Node**, or enable the **30s Background Node Watchdog** under **Analytics & Tray**.

---

## Cross-Platform Packaging

```bash
npm run dist:linux   # -> release/XRPL-Command-Center-0.0.2-alpha-linux-x86_64.AppImage
npm run dist:win     # -> release/XRPL-Command-Center-0.0.2-alpha-win-x64-nsis.exe (+ portable)
npm run dist:mac     # -> release/XRPL-Command-Center-0.0.2-alpha-mac-{arm64,x64}.dmg
```

---

## Keyboard Shortcuts & Performance

| Control | Action |
| :--- | :--- |
| `Ctrl+K` / `Cmd+K` | Open Universal Command Palette (inspect address, tx hash, ledger, or switch modules) |
| `Esc` | Close Command Palette, Signing Modal, or Inspector Drawer |
| Top Bar **Pause** | Freeze live animations while background telemetry, SQLite logging & alerts keep running |
| Top Bar **Sparkles** | Toggle **Reduced Motion** mode for low-power laptops |

---

## Security & Vault Architecture

- **Process-Isolated Rust Cryptographic Vault (`rust-vault/xrpl-vault-sidecar`):** Secret seeds are encrypted at rest in `userData/wallet-vault-rust.enc.json` (`0600` permissions) using **Argon2id** (`64 MiB, 3 iterations`) + **AES-256-GCM**. Decrypted keys live exclusively inside the separate native Rust process in `Zeroizing` buffers that deterministically wipe RAM to `0x00` on lock, timeout, or exit—private keys never enter Node.js/V8 memory during transaction signing (`ed25519-dalek` & RFC-6979 low-S `k256`).
- **Hardened Electron Session:** Strict CSP, `contextIsolation: true`, `nodeIntegration: false`, renderer `sandbox: true`, top-level navigation lock (`will-navigate`), and permission denial (permitting only Ledger USB `0x2c97` over WebHID).
- **Hardware & Air-Gapped Signing:** Connect Ledger devices directly over Chromium WebHID (`vendorId: 0x2c97`), export unsigned canonical `tx_json` QR codes, or combine M-of-N `SignerListSet` partial multi-signatures.
- **Human-in-the-Loop Pre-Flight Gate:** Every transaction runs live `Sequence`, `Fee` cap, unfunded-reserve, and `lsfRequireDestTag` checks before presenting a network-aware (`MAINNET` high-visibility alert vs. `TESTNET`/`DEVNET`) confirmation modal.

---

## License

Licensed under the [MIT License](LICENSE).
