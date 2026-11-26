# Contributing to XRPL Command Center

Thank you for helping improve **XRPL Command Center** — a 100% free, open-source, cross-platform XRP Ledger desktop telemetry, DeFi, and node operations suite.

## Development Setup

### Prerequisites
- **Node.js 20+** and `npm`
- **Rust toolchain (`rustc` + `cargo`)** for building the process-isolated Argon2id cryptographic wallet vault sidecar (`rust-vault/`)

### Quick Start
```bash
git clone https://github.com/petebiggam357/xrpl-command-center.git
cd xrpl-command-center
npm ci
npm run build:rust
npm run dev
```

## Verification Checklist Before Opening a PR

Run all checks locally and ensure zero errors:

```bash
cargo test --manifest-path rust-vault/Cargo.toml
npm run typecheck
npm test
npm run build
```

## Architecture & Guardrails

1. **Zero-Trust Key Isolation:** Private keys, seeds, and vault passphrases must **never** enter the Electron renderer process or `localStorage`. All signing runs inside the Rust sidecar (`rust-vault/`) or hardware/cold-QR signers.
2. **Electron/Shared Type Boundary:** `tsconfig.electron.json` compiles `src/shared/**/*` without DOM types. Never import browser-only modules (`src/store/*`, `src/services/*`) into `src/shared/*`.
3. **Documentation Sync:** Update `README.md` and `CHANGELOG.md` in the same PR whenever adding features, modules, or CLI/packaging changes.
4. **Linux AppImage Packaging:** Keep `compression: normal` in `electron-builder.yml` so Linux AppImages mount and launch immediately.

## Pull Requests

- Keep PRs focused and well-tested (add Vitest specs in `tests/` or Rust unit tests in `rust-vault/src/`).
- Use clear, descriptive commit messages.
- Fill out the PR template checklist completely.
