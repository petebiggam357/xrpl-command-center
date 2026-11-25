import type { NavTab } from './types';

export type EducationCategory =
  | 'fundamentals'
  | 'defi'
  | 'security'
  | 'nodeops'
  | 'command-center';

export interface EducationExternalLink {
  label: string;
  url: string;
  description: string;
  group: 'Official Docs' | 'Learning & Dev' | 'Explorers & Data' | 'Node & Open Source';
}

export interface EducationLesson {
  id: string;
  category: EducationCategory;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  readMinutes: number;
  title: string;
  summary: string;
  appTab?: NavTab;
  appCta?: string;
  keyTakeaways: string[];
  sections: Array<{
    heading: string;
    body: string;
  }>;
  proTip: string;
  links: Array<{ label: string; url: string }>;
}

export interface GlossaryTerm {
  term: string;
  category: 'Protocol' | 'DeFi' | 'Security' | 'Node Ops';
  definition: string;
}

export const EDUCATION_CATEGORY_META: Record<
  EducationCategory,
  { label: string; badgeClass: string }
> = {
  fundamentals: {
    label: 'XRPL Fundamentals',
    badgeClass: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200',
  },
  defi: {
    label: 'DeFi, DEX & AMM',
    badgeClass: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
  },
  security: {
    label: 'Security & Custody',
    badgeClass: 'bg-violet-500/15 border-violet-400/40 text-violet-200',
  },
  nodeops: {
    label: 'Institutional & Node Ops',
    badgeClass: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
  },
  'command-center': {
    label: 'Command Center Mastery',
    badgeClass: 'bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-200',
  },
};

export const EDUCATION_LESSONS: EducationLesson[] = [
  {
    id: 'xrpl-consensus-unl',
    category: 'fundamentals',
    level: 'Beginner',
    readMinutes: 4,
    title: 'How XRPL Consensus & the 80% UNL Quorum Work',
    summary:
      'Why the XRP Ledger achieves deterministic 3–5 second finality without Proof-of-Work mining or staking lockups.',
    appTab: 'command',
    appCta: 'Watch Live Consensus Core',
    keyTakeaways: [
      'Ledgers close every ~3.5 seconds via the Federated Byzantine Agreement (XRPL Consensus Protocol).',
      'Validators exchange proposals across rounds (Open → Establish → Accepted) until ≥80% of a node’s Unique Node List (UNL) agrees on the exact transaction set.',
      'Once validated, a ledger is final and irreversible—there are no probabilistic block reorganizations.',
    ],
    sections: [
      {
        heading: 'No Mining, No Staking Wars',
        body: 'Unlike Proof-of-Work chains that burn electricity to race for block hashes, XRPL validators independently run the consensus algorithm every few seconds. Each server maintains a Unique Node List (UNL) of trusted validators it listens to so that no single party can halt or fork the ledger.',
      },
      {
        heading: 'The Three Phases You See in Command Deck',
        body: 'During OPEN, transactions stream into the open ledger. During ESTABLISH, validators propose transaction sets and converge toward agreement. Once 80% of UNL validators sign the identical ledger hash, the ledger enters ACCEPTED / VALIDATED and triggers the green shockwave in the Consensus Core.',
      },
      {
        heading: 'Protocol Amendments (On-Ledger Governance)',
        body: 'New XRPL features (like XLS-30 AMM, MPTs, or Clawback) activate only when ≥80% of UNL validators vote YES continuously for two full weeks. You can track live amendment voting percentages in the Validators tab.',
      },
    ],
    proTip:
      'Open the 3D Globe or Validators tab while watching the Command Deck—every green pulse on the ring corresponds to a real cryptographic validation signature arriving over the XRPL WebSocket stream.',
    links: [
      { label: 'XRPL Consensus Protocol Docs', url: 'https://xrpl.org/docs/concepts/consensus-protocol' },
      { label: 'Amendments & Governance', url: 'https://xrpl.org/docs/concepts/networks-and-servers/amendments' },
    ],
  },
  {
    id: 'accounts-reserves-fees',
    category: 'fundamentals',
    level: 'Beginner',
    readMinutes: 3,
    title: 'Accounts, XRP Reserves (1 XRP + 0.2 XRP) & Anti-Spam Fees',
    summary:
      'Understand why new XRPL accounts lock a small base reserve, how object reserves work, and why transaction fees are burned.',
    appTab: 'wallets',
    appCta: 'Inspect Your Reserve Meter',
    keyTakeaways: [
      '1 XRP = 1,000,000 drops. Standard transaction fees start at just 10–12 drops (~0.000012 XRP).',
      'Every active account locks a Base Reserve (currently 1 XRP) plus an Owner Reserve (0.2 XRP) for each ledger object it owns (TrustLine, DEX offer, Escrow, Check, NFT page).',
      'Transaction fees are permanently burned (destroyed), not paid to validators—eliminating MEV and validator fee extraction.',
    ],
    sections: [
      {
        heading: 'Why Reserves Exist',
        body: 'Because the entire XRPL state ledger is stored in fast memory/SSD across global nodes, reserves prevent ledger bloat. Your reserve XRP is still yours—removing an unused 0-balance TrustLine or canceling an old DEX offer immediately unlocks that 0.2 XRP back into your spendable balance.',
      },
      {
        heading: 'Fee Escalation Under Load',
        body: 'During high network bursts, the open-ledger fee rises dynamically so legitimate transactions clear smoothly while spam becomes expensive. Our Pre-Flight Signing Modal automatically caps unsafe fees and shows exact drops before you sign.',
      },
    ],
    proTip:
      'Use the Interactive Reserve Calculator right inside this Academy tab to simulate exactly how much XRP stays locked as you add TrustLines, DEX offers, and NFTs.',
    links: [
      { label: 'XRPL Reserves Official Guide', url: 'https://xrpl.org/docs/concepts/accounts/reserves' },
      { label: 'Transaction Cost & Drops', url: 'https://xrpl.org/docs/concepts/transactions/transaction-cost' },
    ],
  },
  {
    id: 'dest-tags-xaddresses',
    category: 'fundamentals',
    level: 'Beginner',
    readMinutes: 3,
    title: 'Destination Tags, X-Addresses & Exchange Deposit Safety',
    summary:
      'How shared exchange wallets route deposits and how XRPL Command Center protects you from missing Destination Tags.',
    appTab: 'wallets',
    appCta: 'Open Address Book & Send Guard',
    keyTakeaways: [
      'Exchanges (Coinbase, Kraken, Bitstamp, Binance, etc.) often use one shared r-address for all customers and rely on a numeric Destination Tag to credit your account.',
      'An X-Address (starting with X on Mainnet or T on Testnet) packs both the classic r-address and the Destination Tag into a single checksummed string.',
      'Our Send form automatically flags known exchanges and saved tagged contacts if you forget a Destination Tag.',
    ],
    sections: [
      {
        heading: 'When Is a Destination Tag Required?',
        body: 'If you are sending to your own self-custody wallet (Rust Vault, Ledger, Trezor, Xaman), you do not need a Destination Tag. If you are sending to an exchange or custodial service, ALWAYS include the exact Destination Tag they provide.',
      },
      {
        heading: 'Built-In Safety Net',
        body: 'Save your frequent exchange deposit addresses in Wallets → Address Book with "Require Tag" enabled and your default tag pre-filled. Whenever you paste an X-Address, click "Decode X-Address" to verify the underlying classic r-address and tag transparently.',
      },
    ],
    proTip:
      'Enable the `RequireDest` account flag (`AccountSet` in Institutional Studio) on corporate treasury accounts so the XRPL protocol itself rejects any incoming payment that lacks a Destination Tag.',
    links: [
      { label: 'Source & Destination Tags', url: 'https://xrpl.org/docs/concepts/transactions/source-and-destination-tags' },
      { label: 'X-Address Format Spec', url: 'https://xrpaddress.info/' },
    ],
  },
  {
    id: 'trustlines-tokens-risk',
    category: 'defi',
    level: 'Intermediate',
    readMinutes: 5,
    title: 'Issued Tokens (IOUs), TrustLines & Issuer Risk Flags',
    summary:
      'How XRPL native tokens work without smart-contract bugs, and how to audit any token issuer for Blackholed, Freeze, or Clawback flags.',
    appTab: 'tokens',
    appCta: 'Open Tokens & Issuer Auditor',
    keyTakeaways: [
      'Before receiving any issued token (like RLUSD, SOLO, or GateHub USD), your account must create a TrustLine (`TrustSet`) specifying the currency, issuer, and maximum limit.',
      'TrustLines prevent unsolicited spam/phishing token airdrops from cluttering your wallet.',
      'Always inspect issuer AccountRoot flags: Blackholed (immutable), GlobalFreeze, NoFreeze, DefaultRipple, and AllowClawback.',
    ],
    sections: [
      {
        heading: 'Why XRPL Tokens Don’t Need ERC-20 Smart Contracts',
        body: 'Token accounting is built directly into the C++ `rippled` protocol as RippleState ledger objects. That eliminates reentrancy bugs, unlimited approval exploits, and malicious transfer hooks common on EVM chains.',
      },
      {
        heading: 'Reading Issuer Risk Flags in Token Explorer',
        body: 'A "Blackholed" issuer has disabled its master key and set its regular key to a provably unspendable address—meaning no more tokens can ever be minted. Regulated stablecoins (like RLUSD) intentionally retain Freeze/Clawback controls for legal compliance.',
      },
    ],
    proTip:
      'In Tokens & DEX, click any token to run an authoritative on-ledger audit (`account_info`, `gateway_balances`, `book_offers`, and `amm_info`) directly from the XRPL node rather than trusting third-party metadata alone.',
    links: [
      { label: 'TrustLines & Issuing Currencies', url: 'https://xrpl.org/docs/concepts/tokens/fungible-tokens' },
      { label: 'Freezing & Clawback Docs', url: 'https://xrpl.org/docs/concepts/tokens/fungible-tokens/freezes' },
    ],
  },
  {
    id: 'clob-amm-pathfinding',
    category: 'defi',
    level: 'Intermediate',
    readMinutes: 5,
    title: 'Native CLOB DEX, XLS-30 AMM Pools & Auto-Bridging PathSwap',
    summary:
      'How XRPL uniquely fuses an on-ledger Central Limit Order Book (CLOB) with Automated Market Makers (AMM) and multi-hop pathfinding.',
    appTab: 'wallets',
    appCta: 'Try Pro DEX & AMM Studio',
    keyTakeaways: [
      'XRPL has had a native on-ledger DEX since 2012—orders execute atomically at protocol level without centralized matching engines.',
      'XLS-30 AMMs use the constant-product invariant (x · y = k) and automatically integrate with the CLOB so traders always receive the best blended execution price.',
      'Auto-Bridging routes token-to-token swaps through XRP automatically when that yields a better rate.',
    ],
    sections: [
      {
        heading: 'CLOB vs. AMM in One Unified Liquidity Engine',
        body: 'When you submit a swap or limit order, the XRPL payment/offer engine checks both open limit orders and the XLS-30 AMM pool simultaneously, consuming whichever side offers the tighter spread.',
      },
      {
        heading: 'Slippage Protection with DeliverMin',
        body: 'In Wallets → Pro DEX, PathSwap & AMM, our Smart PathSwap queries `ripple_path_find` and automatically sets `SendMax` + `DeliverMin` (`tfPartialPayment`) so your swap never executes worse than your chosen slippage tolerance (0.5%, 1.0%, or 2.5%).',
      },
    ],
    proTip:
      'LP token holders can vote directly on an AMM pool’s trading fee (0–100 bps) using `AMMVote` right inside the Pro DEX & AMM sub-tab.',
    links: [
      { label: 'XRPL Decentralized Exchange', url: 'https://xrpl.org/docs/concepts/tokens/decentralized-exchange' },
      { label: 'XLS-30 Automated Market Makers', url: 'https://xrpl.org/docs/concepts/tokens/decentralized-exchange/automated-market-makers' },
    ],
  },
  {
    id: 'escrows-checks-nfts',
    category: 'defi',
    level: 'Intermediate',
    readMinutes: 4,
    title: 'Native Escrows, Deferred Checks & XLS-20 NFTs',
    summary:
      'Built-in protocol primitives for time-locked payments, pull-based checks, and royalty-enforced NFTs.',
    appTab: 'wallets',
    appCta: 'Open Escrows, Checks & NFTs',
    keyTakeaways: [
      'Escrows lock XRP on-ledger until a Ripple Epoch timestamp (`FinishAfter`) or crypto-condition is met, with optional `CancelAfter` claw-home.',
      'Checks let a sender authorize a maximum amount that the recipient pulls later (`CheckCash`)—great for compliance or avoiding unexpected incoming transfers.',
      'XLS-20 NFTs enforce creator royalties natively on-ledger and support zero-fee minting/offers.',
    ],
    sections: [
      {
        heading: 'Time-Locked Escrows',
        body: 'Escrows are used for vesting schedules, milestone releases, and institutional treasury locks. Once `FinishAfter` passes, anyone can submit `EscrowFinish` to release the XRP to the beneficiary.',
      },
      {
        heading: 'XLS-20 NFTs & Safe IPFS Previews',
        body: 'NFT URIs are stored as hex strings on-ledger. XRPL Command Center decodes `ipfs://` and `https://` URIs safely (rejecting unsafe schemes) and renders thumbnails in your Wallet NFT Gallery.',
      },
    ],
    proTip:
      'Test minting an NFT, creating a 2-minute Escrow, and cashing a Check risk-free on XRPL Testnet using the 1-Click Testnet Faucet!',
    links: [
      { label: 'Escrow Overview', url: 'https://xrpl.org/docs/concepts/payment-types/escrow' },
      { label: 'XLS-20 NFTokens Docs', url: 'https://xrpl.org/docs/concepts/tokens/nfts' },
    ],
  },
  {
    id: 'rust-vault-hardware-security',
    category: 'security',
    level: 'Intermediate',
    readMinutes: 4,
    title: 'Self-Custody Mastery: Rust Argon2id Vault, Hardware Wallets & Multi-Sig',
    summary:
      'How XRPL Command Center isolates your private keys in Rust memory, pairs Ledger/Trezor/Cold QR wallets, and coordinates M-of-N Multi-Sign.',
    appTab: 'wallets',
    appCta: 'Open Wallets & Security Hub',
    keyTakeaways: [
      'Local custodial keys live inside a process-isolated Rust sidecar (`xrpl-vault-sidecar`) encrypted with Argon2id (64 MiB) + AES-256-GCM and wiped via `Zeroizing` RAM buffers.',
      'For high-value holdings, pair a Ledger (WebHID USB), Trezor (Bridge/WebUSB), Keystone 3 Pro, Tangem, or Xaman cold wallet so private keys never touch your computer.',
      'Native XRPL Multi-Sign (`SignerListSet`) lets you require e.g. 2-of-3 keys to approve treasury transactions.',
    ],
    sections: [
      {
        heading: 'Why Process Isolation Matters',
        body: 'In standard JavaScript wallets, decrypted seeds can linger in V8 garbage-collected heap memory. Our hybrid architecture keeps raw seeds strictly inside the compiled Rust binary—Electron only receives signed transaction blobs.',
      },
      {
        heading: 'Disaster Recovery Best Practices',
        body: 'Use the Backup button in Wallets to export an encrypted `.xrplvault` file (safe to store on a USB stick because it remains Argon2id + AES-256-GCM ciphertext), AND print our offline Paper Recovery Sheet to handwrite your backup seed in pen.',
      },
    ],
    proTip:
      'Never screenshot or email your family seed (`sEd…` / `s…`). Always verify the network badge (`MAINNET` vs `TESTNET`) in the Pre-Flight Confirmation Modal before signing.',
    links: [
      { label: 'Cryptographic Keys on XRPL', url: 'https://xrpl.org/docs/concepts/accounts/cryptographic-keys' },
      { label: 'Multi-Signing on XRPL', url: 'https://xrpl.org/docs/concepts/accounts/multi-signing' },
    ],
  },
  {
    id: 'institutional-mpt-oracle-did',
    category: 'nodeops',
    level: 'Advanced',
    readMinutes: 5,
    title: 'Institutional XRPL: MPTs, XLS-47 Oracles, XLS-40 DIDs & xrp-ledger.toml',
    summary:
      'Next-generation enterprise primitives for tokenized real-world assets (RWAs), on-ledger price feeds, and verifiable identity.',
    appTab: 'primitives',
    appCta: 'Open Institutional Studio',
    keyTakeaways: [
      'Multi-Purpose Tokens (MPTs) provide compact, institutional fungible tokens with built-in metadata, transfer fees, locking, escrow, and clawback flags.',
      'XLS-47 Native Price Oracles publish verifiable asset prices on-ledger and aggregate them via `get_aggregate_price`.',
      'XLS-40 DIDs anchor W3C Decentralized Identifiers (`did:xrpl`) directly to XRPL accounts, while `xrp-ledger.toml` verifies domain ownership.',
    ],
    sections: [
      {
        heading: 'Domain Verification with xrp-ledger.toml',
        body: 'Token issuers and validators prove their identity by hosting `/.well-known/xrp-ledger.toml` over HTTPS and setting their on-ledger `AccountSet` Domain field to match. Our Institutional Studio generates, lints, and links your domain in 1 click.',
      },
      {
        heading: 'Regulated RWA Tokenization',
        body: 'MPTs (`MPTokenIssuanceCreate`) + `Clawback` (`XLS-39`) allow compliant issuers to tokenize bonds, treasuries, or stablecoins with deterministic settlement and auditable supply caps.',
      },
    ],
    proTip:
      'Always test your `MPTokenIssuanceCreate` flags on Devnet/Testnet first—some issuance flags are immutable once created on Mainnet.',
    links: [
      { label: 'Multi-Purpose Tokens (MPT)', url: 'https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens' },
      { label: 'XLS-47 Price Oracles', url: 'https://xrpl.org/docs/concepts/decentralized-storage/price-oracles' },
      { label: 'xrp-ledger.toml Standard', url: 'https://xrpl.org/docs/references/xrp-ledger-toml' },
    ],
  },
  {
    id: 'running-your-own-rippled-node',
    category: 'nodeops',
    level: 'Advanced',
    readMinutes: 5,
    title: 'Running Your Own rippled Node, Custom NVMe Storage & SSH Tunnels',
    summary:
      'Why running your own stock/validator node gives you trustless telemetry, how to store ledger DBs on a fast secondary SSD, and how to secure Admin RPC.',
    appTab: 'nodeops',
    appCta: 'Open My Node Ops & Docker',
    keyTakeaways: [
      'Ledger databases (`NuDB` / `RocksDB`) can grow to tens or hundreds of gigabytes—use our Custom Storage Drive Picker to place `data/db` on a fast internal NVMe or external SSD.',
      'Set `online_delete` (e.g. `2000` ledgers) to automatically prune old ledger history so disk usage stays bounded.',
      'NEVER expose Admin RPC port `5005` to the public internet—bind strictly to `127.0.0.1` and use SSH local port forwarding for remote VPS nodes.',
    ],
    sections: [
      {
        heading: '1-Click Docker Node with Custom Drive Mounting',
        body: 'In My Node Ops → 1-Click Docker Node, click "Browse Drive / Folder…" to pick any secondary NVMe or external SSD. Command Center checks free disk space live via `fs.statfs`, generates a secure loopback-only `rippled.cfg`, and bind-mounts your chosen drive into `xrpllabsofficial/xrpld:latest`.',
      },
      {
        heading: 'Visual rippled.cfg Diff Studio & Safe Backups',
        body: 'Every config edit displays a red/green unified line diff and automatically creates timestamped `.bak` backups before writing to disk.',
      },
    ],
    proTip:
      'Once your local node is synced, click "Stream Live Visuals From My Node" in My Node Ops (or save it as a Custom Endpoint Profile in the Top HUD Bar) to power the entire Command Center from your own trustless hardware!',
    links: [
      { label: 'Install & Run rippled', url: 'https://xrpl.org/docs/infrastructure/installation' },
      { label: 'Capacity Planning & NuDB', url: 'https://xrpl.org/docs/infrastructure/installation/capacity-planning' },
      { label: 'XRPLF rippled GitHub', url: 'https://github.com/XRPLF/rippled' },
    ],
  },
  {
    id: 'command-center-tour',
    category: 'command-center',
    level: 'Beginner',
    readMinutes: 4,
    title: 'XRPL Command Center Complete Feature Tour & Power-User Shortcuts',
    summary:
      'Master every cockpit module, keyboard shortcut, Whale Radar, SQLite Analytics, and Performance HUD in under 4 minutes.',
    appTab: 'command',
    appCta: 'Go to Command Deck',
    keyTakeaways: [
      'Press `Ctrl+K` (or `Cmd+K`) anywhere to jump between modules or instantly inspect any `r-address`, 64-char tx hash, or ledger number.',
      'Click any glowing particle in the Transaction River or any block in the Ledger Ribbon to open the On-Ledger Deep Inspector with decoded UTF-8 Memos.',
      'Use the Top HUD Bar icons to toggle Whale/Watchlist Audio Pings, Live FPS/Heap Perf HUD, Pause, Reduced Motion, or switch Saved Node Endpoints.',
    ],
    sections: [
      {
        heading: 'Every Tab at a Glance',
        body: 'Command Deck = 60fps Consensus Core & Particle River • 3D Globe = WebGL2 Validator Topology • Validators = UNL Agreement & Amendment Voting Radar • Tokens & DEX = Issuer Audit + CLOB/AMM Curve • Wallets & DeFi = Rust Vault, Address Book, Hardware Hub & PathSwap • Institutional = MPT, Oracles, DID & TOML • My Node Ops = Docker, Custom Drive & Config Diff • Analytics & Tray = Embedded SQLite + CSV Tax Export + 30s Node Watchdog.',
      },
      {
        heading: 'Zero-Cost Learning with Testnet Playground',
        body: 'Click the `?` Quick-Start button in the Top HUD Bar anytime to launch Testnet Playground mode—practice creating wallets, funding with free Testnet XRP, sending tagged payments, and swapping on the AMM with zero risk.',
      },
    ],
    proTip:
      'Enable "Minimize to Tray" and "30s Background Node Watchdog" in Analytics & Tray to get native OS desktop notifications if your self-hosted `rippled` node ever loses peers or falls out of sync.',
    links: [
      { label: 'XRPL Learning Portal', url: 'https://learn.xrpl.org/' },
      { label: 'XRPL Developer Docs', url: 'https://xrpl.org/docs' },
    ],
  },
];

export const XRPL_GLOSSARY: GlossaryTerm[] = [
  {
    term: 'UNL / dUNL',
    category: 'Protocol',
    definition:
      'Unique Node List — the curated list of trusted validators a rippled server listens to during consensus. 80% agreement across the UNL validates each ledger.',
  },
  {
    term: 'Drops',
    category: 'Protocol',
    definition:
      'The smallest unit of XRP. 1 XRP = 1,000,000 drops (0.000001 XRP). Base transaction fees are measured in drops (typically 10–12 drops).',
  },
  {
    term: 'Base & Owner Reserve',
    category: 'Protocol',
    definition:
      'Minimum XRP locked in an account to prevent ledger spam: currently 1 XRP Base Reserve + 0.2 XRP per owned ledger object (TrustLine, DEX offer, Escrow, NFT page).',
  },
  {
    term: 'Destination Tag',
    category: 'Protocol',
    definition:
      'An unsigned 32-bit integer attached to a payment to identify a specific customer sub-account at an exchange or custodial gateway.',
  },
  {
    term: 'X-Address',
    category: 'Protocol',
    definition:
      'An encoded XRPL address (starting with X on Mainnet or T on Testnet) that combines a classic r-address and optional Destination Tag into one checksummed string.',
  },
  {
    term: 'Amendment',
    category: 'Protocol',
    definition:
      'An on-ledger protocol upgrade voted on by UNL validators. Requires ≥80% validator support continuously for 2 weeks to activate.',
  },
  {
    term: 'TrustLine (RippleState)',
    category: 'DeFi',
    definition:
      'An explicit opt-in ledger entry linking an account to an issued token currency and issuer up to a maximum balance limit.',
  },
  {
    term: 'NoRipple Flag',
    category: 'DeFi',
    definition:
      'A TrustLine setting that prevents your balances from rippling across two issuers of the same currency code. Enabled by default for regular users.',
  },
  {
    term: 'Blackholed Account',
    category: 'Security',
    definition:
      'An issuer account whose master key is disabled and regular key is set to an unspendable address—making token supply permanently immutable.',
  },
  {
    term: 'Clawback (XLS-39)',
    category: 'DeFi',
    definition:
      'An opt-in regulatory issuer flag allowing an authorized asset issuer to recover issued tokens or MPTs for legal compliance.',
  },
  {
    term: 'CLOB + AMM (XLS-30)',
    category: 'DeFi',
    definition:
      'XRPL’s unified liquidity engine combining Central Limit Order Books with constant-product (x·y=k) Automated Market Makers.',
  },
  {
    term: 'Auto-Bridging',
    category: 'DeFi',
    definition:
      'Protocol-level routing that automatically bridges Token A → XRP → Token B when two-hop liquidity beats the direct pair.',
  },
  {
    term: 'MPT (Multi-Purpose Token)',
    category: 'DeFi',
    definition:
      'Compact institutional fungible token standard supporting native metadata, transfer fees, locking, escrow, and compliance controls.',
  },
  {
    term: 'XLS-47 Price Oracle',
    category: 'Protocol',
    definition:
      'Native on-ledger price oracle ledger objects that can be queried and median-aggregated directly by `rippled` via `get_aggregate_price`.',
  },
  {
    term: 'XLS-40 DID',
    category: 'Protocol',
    definition:
      'W3C Decentralized Identifier (`did:xrpl`) anchored directly on an XRPL account for verifiable institutional or personal credentials.',
  },
  {
    term: 'Argon2id + Zeroize',
    category: 'Security',
    definition:
      'Memory-hard key derivation (64 MiB) + deterministic Rust RAM scrubbing used by our isolated `xrpl-vault-sidecar` so private keys never sit in V8 memory.',
  },
  {
    term: 'Multi-Sign Quorum',
    category: 'Security',
    definition:
      'An on-ledger `SignerListSet` policy requiring a weighted threshold (e.g. 2-of-3 keys) to authorize transactions from an account.',
  },
  {
    term: 'NuDB vs. RocksDB',
    category: 'Node Ops',
    definition:
      'Key-value ledger storage engines used by `rippled`. NuDB is append-only and optimized for high-speed NVMe/SSD drives.',
  },
  {
    term: 'online_delete',
    category: 'Node Ops',
    definition:
      'A `rippled.cfg` setting that automatically prunes older ledger history beyond N ledgers (e.g. 2000) to keep disk usage predictable.',
  },
  {
    term: 'Clio Server',
    category: 'Node Ops',
    definition:
      'An optimized XRPL API server backed by Cassandra/ScyllaDB that offloads read-heavy RPC/WebSocket queries from peer-to-peer `rippled` nodes.',
  },
];

export const OFFICIAL_XRPL_LINKS: EducationExternalLink[] = [
  {
    label: 'XRPL Official Documentation',
    url: 'https://xrpl.org/docs',
    description: 'Authoritative reference for consensus, transactions, APIs, reserves, and amendments.',
    group: 'Official Docs',
  },
  {
    label: 'XRPL Learning Portal (learn.xrpl.org)',
    url: 'https://learn.xrpl.org/',
    description: 'Structured interactive courses covering XRPL fundamentals, DeFi, tokens, and development.',
    group: 'Learning & Dev',
  },
  {
    label: 'XRPL Consensus Protocol Deep Dive',
    url: 'https://xrpl.org/docs/concepts/consensus-protocol',
    description: 'Technical walkthrough of UNLs, validation rounds, and deterministic finality.',
    group: 'Official Docs',
  },
  {
    label: 'XLS-30 AMM & Native DEX Docs',
    url: 'https://xrpl.org/docs/concepts/tokens/decentralized-exchange/automated-market-makers',
    description: 'Constant-product AMM math, auction slots, fee voting, and CLOB integration.',
    group: 'Official Docs',
  },
  {
    label: 'Multi-Purpose Tokens (MPT) Spec',
    url: 'https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens',
    description: 'Institutional fungible token architecture for RWAs and regulated issuers.',
    group: 'Official Docs',
  },
  {
    label: 'XRPL Foundation GitHub (rippled)',
    url: 'https://github.com/XRPLF/rippled',
    description: 'Open-source C++ core server codebase, release notes, and amendment tracker.',
    group: 'Node & Open Source',
  },
  {
    label: 'Run & Size Your Own rippled Node',
    url: 'https://xrpl.org/docs/infrastructure/installation/capacity-planning',
    description: 'Official hardware, RAM, NVMe IOPS, and NuDB storage planning guide.',
    group: 'Node & Open Source',
  },
  {
    label: 'XRPLF Validator History Service (VHS)',
    url: 'https://livenet.xrpl.org/network/validators',
    description: 'Live global UNL validator agreement scores, domains, and topology metrics.',
    group: 'Explorers & Data',
  },
  {
    label: 'XRPScan Explorer & Amendments',
    url: 'https://xrpscan.com/',
    description: 'Live explorer, rich list, metrics, and real-time UNL amendment voting tracker.',
    group: 'Explorers & Data',
  },
  {
    label: 'Bithomp XRPL Explorer',
    url: 'https://bithomp.com/',
    description: 'Fast account, NFT, username, and transaction explorer for Mainnet & Testnet.',
    group: 'Explorers & Data',
  },
  {
    label: 'XRPL Testnet & Devnet Faucets',
    url: 'https://xrpl.org/resources/dev-tools/xrp-faucets',
    description: 'Official faucet portals for generating free practice XRP on Testnet and Devnet.',
    group: 'Learning & Dev',
  },
  {
    label: 'XRPL Standards (XLS Proposals)',
    url: 'https://github.com/XRPLF/XRPL-Standards',
    description: 'Community specifications for XLS-20 NFTs, XLS-30 AMM, XLS-39 Clawback, XLS-40 DID & XLS-47 Oracles.',
    group: 'Learning & Dev',
  },
];
