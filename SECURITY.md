# Security Policy

**XRPL Command Center** handles sensitive XRPL wallet cryptography, hardware wallet sessions, and local node RPC connections. We take security vulnerabilities seriously.

## Security Architecture Highlights

- **Process-Isolated Rust Vault (`rust-vault/`):** Master passphrases are stretched with **Argon2id (`64 MiB`, `t=3`, `p=1`)**, encrypted at rest with **AES-256-GCM**, and zeroized in RAM via `zeroize::Zeroizing`.
- **Context Isolation:** The Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and strict IPC allowlisting via `electron/preload.ts`.
- **Hardware & Air-Gapped Signing:** Ledger USB (WebHID), Trezor (Bridge/WebUSB), and Keystone/Tangem/D'CENT/Xaman QR signing keep private keys completely off the host machine.
- **Zero Telemetry:** No analytics, crash trackers, or third-party key escrow servers exist anywhere in the codebase.

## Verifying Release Binaries

Every release publishes per-platform SHA-256 checksum manifests (`SHA256SUMS-linux.txt`, `SHA256SUMS-win.txt`, `SHA256SUMS-mac.txt`):

```bash
# Linux / macOS
sha256sum -c SHA256SUMS-linux.txt

# Windows (PowerShell)
Get-FileHash .\XRPL-Command-Center-*-win-x64-setup.exe -Algorithm SHA256
```

## Reporting a Vulnerability

**Please do not open a public GitHub Issue for security vulnerabilities.**

Instead, please report security issues privately using **GitHub Security Advisories** ("Report a vulnerability" under the repository's **Security** tab) with:

1. Affected component (`rust-vault`, Electron IPC/preload, hardware signing, XRPL transaction builder, or packaging).
2. Clear reproduction steps or proof-of-concept.
3. Potential impact assessment.

We will acknowledge reports within **48 hours** and coordinate a fix and disclosure timeline with you.
