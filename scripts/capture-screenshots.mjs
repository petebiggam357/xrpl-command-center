import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'docs', 'media', 'screenshots');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Clean showcase data (zero real user PII/keys) injected into window.xrplApi for crystal-clear marketing screenshots
const SHOWCASE_PRELOAD_JS = `
(() => {
  localStorage.setItem('xrpl-cc-quickstart-seen-v1', '1');
  localStorage.setItem('xrpl-cc-sidebar-collapsed-v1', '0');

  const now = Date.now();
  const sampleValidators = [
    { publicKey: 'nHUon2tpyJEHHYGmxqeGu37cvPYHzrKorbarKPddadqZeomtqYVH', domain: 'xrplf.org', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.999, agreement30d: 0.999, serverVersion: '3.3.0', country: 'US', lat: 37.77, lon: -122.41 },
    { publicKey: 'nHBidG3p5P111111111111111111111111111111111111111111', domain: 'ripple.com', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 1.0, agreement30d: 0.999, serverVersion: '3.3.0', country: 'US', lat: 40.71, lon: -74.00 },
    { publicKey: 'nHBidG3p5P222222222222222222222222222222222222222222', domain: 'alloy.ee', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.998, agreement30d: 0.998, serverVersion: '3.3.0', country: 'DE', lat: 50.11, lon: 8.68 },
    { publicKey: 'nHBidG3p5P333333333333333333333333333333333333333333', domain: 'bithomp.com', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.999, agreement30d: 0.999, serverVersion: '3.3.0', country: 'SE', lat: 59.33, lon: 18.06 },
    { publicKey: 'nHBidG3p5P444444444444444444444444444444444444444444', domain: 'xrpscan.com', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.999, agreement30d: 0.998, serverVersion: '3.3.0', country: 'SG', lat: 1.35, lon: 103.82 },
    { publicKey: 'nHBidG3p5P555555555555555555555555555555555555555555', domain: 'tokyo.xrpl.jp', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.999, agreement30d: 0.999, serverVersion: '3.3.0', country: 'JP', lat: 35.68, lon: 139.69 },
    { publicKey: 'nHBidG3p5P666666666666666666666666666666666666666666', domain: 'sydney.xrpl.au', domainVerified: true, unl: true, agreement1h: 0.999, agreement24h: 0.998, agreement30d: 0.998, serverVersion: '3.3.0', country: 'AU', lat: -33.86, lon: 151.21 },
    { publicKey: 'nHBidG3p5P777777777777777777777777777777777777777777', domain: 'london.xrpl.uk', domainVerified: true, unl: true, agreement1h: 1.0, agreement24h: 0.999, agreement30d: 0.999, serverVersion: '3.3.0', country: 'GB', lat: 51.50, lon: -0.12 },
    { publicKey: 'nHBidG3p5P888888888888888888888888888888888888888888', domain: 'saopaulo.xrpl.br', domainVerified: true, unl: false, agreement1h: 0.997, agreement24h: 0.995, agreement30d: 0.994, serverVersion: '3.3.0', country: 'BR', lat: -23.55, lon: -46.63 },
  ];

  const sampleTopology = sampleValidators.map((v, i) => ({
    pubkey: v.publicKey,
    version: '3.3.0',
    country: v.country,
    lat: v.lat,
    lon: v.lon,
    inbound: 18 + i * 3,
    outbound: 12 + i * 2,
    uptime: 86400 * (12 + i),
    isValidator: v.unl,
  }));

  const sampleTokens = [
    { id: 'RLUSD:rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', currency: 'RLUSD', currencyRaw: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', name: 'Ripple USD', domain: 'ripple.com', holders: 42800, trustlines: 58900, supply: 248000000, volume24hUsd: 18400000, marketcapUsd: 248000000, priceUsd: 1.0, source: 'xrplmeta' },
    { id: 'SOLO:rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz', currency: 'SOLO', currencyRaw: '534F4C4F00000000000000000000000000000000', issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz', name: 'Sologenic', domain: 'sologenic.com', holders: 215000, trustlines: 342000, supply: 399000000, volume24hUsd: 6200000, marketcapUsd: 112000000, priceUsd: 0.28, source: 'xrplmeta' },
    { id: 'USD:rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', currency: 'USD', currencyRaw: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', name: 'Bitstamp USD', domain: 'bitstamp.net', holders: 124000, trustlines: 189000, supply: 42000000, volume24hUsd: 4900000, marketcapUsd: 42000000, priceUsd: 1.0, source: 'xrplmeta' },
    { id: 'CORE:rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D', currency: 'CORE', currencyRaw: '434F524500000000000000000000000000000000', issuer: 'rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D', name: 'Coreum', domain: 'coreum.com', holders: 68500, trustlines: 96000, supply: 120000000, volume24hUsd: 2100000, marketcapUsd: 26400000, priceUsd: 0.22, source: 'xrplmeta' },
  ];

  const sampleTokenReport = {
    currency: 'RLUSD',
    currencyRaw: '524C555344000000000000000000000000000000',
    issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
    fetchedAt: now,
    xrpBalance: '14,200.50',
    totalObligation: '248,120,450',
    flags: { blackholed: false, disableMaster: true, globalFreeze: false, noFreeze: false, allowClawback: true, requireAuth: false, defaultRipple: true, depositAuth: false, domain: 'ripple.com' },
    bids: [
      { price: 0.402, size: 84000, total: 84000, account: 'rBid1' },
      { price: 0.401, size: 120000, total: 204000, account: 'rBid2' },
      { price: 0.399, size: 195000, total: 399000, account: 'rBid3' },
    ],
    asks: [
      { price: 0.405, size: 75000, total: 75000, account: 'rAsk1' },
      { price: 0.407, size: 135000, total: 210000, account: 'rAsk2' },
      { price: 0.410, size: 210000, total: 420000, account: 'rAsk3' },
    ],
    amm: {
      account: 'rAmmRLUSDPool111111111111111111111',
      asset1Amount: '1,240,000 XRP',
      asset2Amount: '3,120,000 RLUSD',
      asset1Numeric: 1240000,
      asset2Numeric: 3120000,
      tradingFeeBps: 0.3,
      lpTokenSupply: '1,966,926',
    },
  };

  const sampleAccounts = [
    { id: 'w1', label: 'Primary Treasury (Ed25519)', address: 'rDemoTreasury888888888888888888888', kind: 'custodial', algorithm: 'ed25519', createdAt: now - 86400000 },
    { id: 'w2', label: 'Ledger Nano X Cold', address: 'rDemoLedgerCold7777777777777777777', kind: 'hardware-ledger', derivationPath: "44'/144'/0'/0/0", createdAt: now - 40000000 },
    { id: 'w3', label: 'AMM Liquidity Desk', address: 'rDemoAmmDesk6666666666666666666666', kind: 'custodial', algorithm: 'ed25519', createdAt: now - 10000000 },
  ];

  const samplePortfolio = {
    address: sampleAccounts[0].address,
    funded: true,
    fetchedAt: now,
    totalXrp: 48250.75,
    totalXrpDisplay: '48,250.75',
    baseReserveXrp: 1,
    ownerReserveXrp: 1.4,
    spendableXrp: 48248.35,
    sequence: 1842,
    ownerCount: 7,
    flags: { blackholed: false, disableMaster: false, globalFreeze: false, noFreeze: false, allowClawback: false, requireAuth: false, defaultRipple: false, depositAuth: false, requireDestTag: true },
    signerList: { signerQuorum: 2, signers: [{ account: 'rSignerA1111111111111111111111111', weight: 1 }, { account: 'rSignerB2222222222222222222222222', weight: 1 }] },
    tokens: [
      { currency: 'RLUSD', currencyRaw: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', balance: '24,500.00', limit: '1000000', noRipple: true, authorized: true, freeze: false },
      { currency: 'SOLO', currencyRaw: '534F4C4F00000000000000000000000000000000', issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz', balance: '12,000.00', limit: '500000', noRipple: true, authorized: true, freeze: false },
    ],
    offers: [],
    escrows: [{ index: 'ESC1', account: sampleAccounts[0].address, destination: sampleAccounts[1].address, amountXrp: '5,000', finishAfterMs: now + 86400000 * 30, offerSequence: 1840 }],
    checks: [],
    nfts: [],
    recentTransactions: [
      { id: 't1', hash: 'A1B2C3D4E5F6'.padEnd(64, '0'), txType: 'Payment', category: 'payment', account: sampleAccounts[0].address, destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', amountDisplay: '2,500 XRP', amountXrpEstimate: 2500, feeDrops: 12, validated: true, engineResult: 'tesSUCCESS', timestamp: now - 30000, isWhale: false },
      { id: 't2', hash: 'F6E5D4C3B2A1'.padEnd(64, '1'), txType: 'AMMDeposit', category: 'amm', account: sampleAccounts[0].address, amountDisplay: '10,000 RLUSD', amountXrpEstimate: 4000, feeDrops: 12, validated: true, engineResult: 'tesSUCCESS', timestamp: now - 120000, isWhale: false },
    ],
  };

  const listeners = { status: [], ledger: [], tx: [], val: [], phase: [] };

  window.xrplApi = {
    isElectron: true,
    platform: 'linux',
    version: '0.2.8-beta',
    connectNetwork: async () => ({ connected: true, connecting: false, networkId: 'mainnet', endpoint: 'ws://127.0.0.1:6006 (Local Node)', latencyMs: 1, serverLoadFactor: 1, serverVersion: '3.3.0', peerCount: 14, consensusPhase: 'accepted' }),
    getStreamStatus: async () => ({ connected: true, connecting: false, networkId: 'mainnet', endpoint: 'ws://127.0.0.1:6006 (Local Node)', latencyMs: 1, serverLoadFactor: 1, serverVersion: '3.3.0', peerCount: 14, consensusPhase: 'accepted' }),
    rpcRequest: async (cmd) => {
      if (cmd === 'fee') return { result: { drops: { open_ledger_fee: '10', median_fee: '10', minimum_fee: '10' }, current_queue_size: '2', max_queue_size: '100', current_ledger_size: '48', expected_ledger_size: '80' } };
      return { result: { status: 'success', info: { build_version: '3.3.0', peers: 14, server_state: 'full' } } };
    },
    fetchValidators: async () => ({ validators: sampleValidators, topology: sampleTopology, fetchedAt: now, source: 'xrplf-vhs' }),
    fetchTokens: async () => ({ tokens: sampleTokens, fetchedAt: now, source: 'xrplmeta' }),
    inspectTokenOnLedger: async () => sampleTokenReport,
    inspectQuery: async () => ({ kind: 'account', query: sampleAccounts[0].address, title: sampleAccounts[0].address, summary: [], raw: {} }),
    nodeOpsPoll: async () => ({
      connected: true, endpoint: 'http://127.0.0.1:5005', checkedAt: now, buildVersion: '3.3.0', serverState: 'full',
      completeLedgers: '108608167-108612480', validatedLedgerSeq: 108612480, validatedLedgerAgeSec: 2,
      peersCount: 14, inboundPeers: 4, outboundPeers: 10, uptimeSec: 86400 * 4 + 3600 * 5, loadFactor: 1,
      validationQuorum: 28, pubkeyNode: 'n9JjBqN5L4BkL6HSkJWfDNhb6DCfDUMiRzThKvsprtJtaBKwcyzb', isValidator: false,
      ioLatencyMs: 1, peers: [], amendments: [], adminAvailable: true,
    }),
    nodeOpsAdminCommand: async () => ({ ok: true, result: {} }),
    nodeOpsReadLogTail: async () => ({ ok: true, lines: ['[Auto-detected Docker log file: /media/nvme/XRPLNode/data/log/debug.log]', 'LedgerConsensus:NFO Validated ledger #108612480 (quorum 28/35)'] }),
    dockerGetStatus: async () => ({ dockerInstalled: true, daemonRunning: true, dockerVersion: '27.3.1', containerExists: true, containerRunning: true, containerName: 'xrpl-command-node', containerState: 'running', image: 'xrpllabsofficial/xrpld:latest', storageRoot: '/media/nvme/XRPLNode', configDir: '/media/nvme/XRPLNode/config', dataDir: '/media/nvme/XRPLNode/data', isCustomStorage: true, freeGb: 842.4, totalGb: 1000 }),
    dockerChooseStorageFolder: async () => ({ ok: false, cancelled: true }),
    dockerSetStorageFolder: async () => ({ ok: true }),
    dockerInspectStorage: async () => ({ storageRoot: '/media/nvme/XRPLNode', configDir: '/media/nvme/XRPLNode/config', dataDir: '/media/nvme/XRPLNode/data', isDefault: false, exists: true, writable: true, freeBytes: 904500000000, totalBytes: 1000000000000, freeGb: 842.4, totalGb: 1000 }),
    dockerProvisionNode: async () => ({ ok: true }),
    dockerLifecycleAction: async () => ({ ok: true }),
    dockerReadLogs: async () => ({ ok: true, lines: ['2026-Nov-27 UTC LedgerMaster:NFO Full synced ledger #108612480'] }),
    nodeConfigLoad: async () => ({ configDir: '/media/nvme/XRPLNode/config', rippledCfg: '[server]\\nport_rpc_admin_local', validatorsTxt: '[validator_list_sites]\\nhttps://vl.xrplf.org' }),
    nodeConfigSaveWithBackup: async () => ({ ok: true }),
    walletGetStatus: async () => ({ initialized: true, unlocked: true, osKeychainAvailable: true, backend: 'rust-sidecar', kdf: 'Argon2id (64 MiB)', sidecarPid: 42190, accounts: sampleAccounts }),
    walletSetupVault: async () => ({ ok: true }),
    walletUnlockVault: async () => ({ ok: true }),
    walletLockVault: async () => ({ initialized: true, unlocked: false, osKeychainAvailable: true, accounts: sampleAccounts }),
    walletCreate: async () => ({ ok: true }),
    walletImportSeed: async () => ({ ok: true }),
    walletAddWatchOnly: async () => ({ ok: true }),
    walletRemoveAccount: async () => ({ initialized: true, unlocked: true, osKeychainAvailable: true, accounts: sampleAccounts }),
    walletFetchPortfolio: async () => samplePortfolio,
    walletFundFaucet: async () => ({ ok: true }),
    walletPreflightTx: async () => ({ ok: true, txJson: {}, summaryLines: [] }),
    walletSignAndSubmitTx: async () => ({ ok: true }),
    walletSubmitSignedBlob: async () => ({ ok: true }),
    walletSignMultisigPartial: async () => ({ ok: true }),
    walletCombineAndSubmitMultisig: async () => ({ ok: true }),
    dexFindBestPath: async () => ({ ok: true, sourceAmountDisplay: '100 XRP', sendMaxSpec: { currency: 'XRP', value: '100' }, deliverMinSpec: { currency: 'RLUSD', value: '245' }, destinationAmountSpec: { currency: 'RLUSD', value: '248' }, hopsSummary: 'XRP -> AMM -> RLUSD' }),
    oracleQueryAggregate: async () => ({ ok: true, baseAsset: 'XRP', quoteAsset: 'USD', median: '2.48' }),
    didResolveAccount: async () => ({ ok: false, did: '', address: '' }),
    analyticsGetSummary: async () => ({ dbPath: 'command-center.sqlite', dbSizeBytes: 1840000, recordedLedgers: 4280, recordedTxJournal: 194, avgTpsRecent: 42.6, avgFeeDropsRecent: 12, peakTxnLedger: { ledgerIndex: 108612410, txnCount: 188 }, recentJournal: [], ledgerSeries: [] }),
    analyticsExportCsv: async () => ({ ok: true }),
    systemGetTrayUpdaterState: async () => ({ minimizeToTray: true, nodeWatchdogEnabled: true, currentVersion: '0.2.8-beta', updateState: 'not-available' }),
    systemUpdateTraySettings: async () => ({ minimizeToTray: true, nodeWatchdogEnabled: true, currentVersion: '0.2.8-beta', updateState: 'idle' }),
    systemCheckForUpdates: async () => ({ minimizeToTray: true, nodeWatchdogEnabled: true, currentVersion: '0.2.8-beta', updateState: 'not-available' }),
    fetchMarketPrices: async () => ({ xrpUsd: 2.48, change24hPct: 4.82, source: 'coingecko', fetchedAt: now }),
    fetchAmendments: async () => ({
      amendments: [
        { id: 'A1', name: 'SingleAssetVault', enabled: false, supported: true, count: 27, threshold: 28, percent: 77.1 },
        { id: 'A2', name: 'LendingProtocol', enabled: false, supported: true, count: 24, threshold: 28, percent: 68.6 },
        { id: 'A3', name: 'MPTokensV1', enabled: true, supported: true, count: 33, threshold: 28, percent: 94.3 },
      ],
      source: 'local-rippled',
      fetchedAt: now,
    }),
    decodeXAddress: async () => ({ ok: true }),
    encodeXAddress: async () => ({ ok: true }),
    walletExportBackup: async () => ({ ok: true }),
    walletImportBackup: async () => ({ ok: true }),
    walletSetAutoLockMinutes: async (m) => ({ ok: true, minutes: m }),
    walletExportSecurityAudit: async () => ({ ok: true }),
    analyticsExportTaxCsv: async () => ({ ok: true }),
    systemExportDiagnostics: async () => ({ ok: true }),
    notifyDesktop: async () => {},
    onStreamStatus: (cb) => { listeners.status.push(cb); return () => {}; },
    onLedgerClosed: (cb) => { listeners.ledger.push(cb); return () => {}; },
    onTransaction: (cb) => { listeners.tx.push(cb); return () => {}; },
    onValidation: (cb) => { listeners.val.push(cb); return () => {}; },
    onConsensusPhase: (cb) => { listeners.phase.push(cb); return () => {}; },
  };

  // Emit vibrant live telemetry bursts for Command Deck canvas + feeds
  setTimeout(() => {
    const types = [
      { txType: 'Payment', category: 'payment', amt: '12,450 XRP', est: 12450, whale: false },
      { txType: 'OfferCreate', category: 'dex', amt: '45,000 RLUSD', est: 18000, whale: false },
      { txType: 'Payment', category: 'payment', amt: '380,000 XRP', est: 380000, whale: true },
      { txType: 'AMMDeposit', category: 'amm', amt: '25,000 XRP', est: 25000, whale: false },
      { txType: 'NFTokenMint', category: 'nft', amt: '1 NFT (XLS-20)', est: 1, whale: false },
      { txType: 'TrustSet', category: 'trust', amt: 'RLUSD TrustLine', est: 0, whale: false },
      { txType: 'EscrowCreate', category: 'escrow', amt: '50,000 XRP', est: 50000, whale: false },
    ];
    for (let k = 0; k < 8; k++) {
      const seq = 108612473 + k;
      listeners.ledger.forEach((cb) => cb({
        ledgerIndex: seq,
        ledgerHash: ('AA11BB22CC33' + seq).padEnd(64, 'F'),
        ledgerTime: now - (8 - k) * 3500,
        txnCount: 78 + ((k * 17) % 64),
        feeBaseDrops: 10,
        reserveBaseXrp: 1,
        reserveIncXrp: 0.2,
        validatedLedgers: '108608167-' + seq,
        closeDurationMs: 3400 + (k % 3) * 180,
      }));
    }
    let idx = 0;
    const emitBatch = () => {
      for (let j = 0; j < 4; j++) {
        const spec = types[(idx + j) % types.length];
        const tx = {
          id: 'demo-' + idx + '-' + j,
          hash: ('DEAD' + (idx * 10 + j)).padEnd(64, 'A'),
          txType: spec.txType,
          category: spec.category,
          account: 'rDemoAcct' + ((idx + j) % 9) + '1111111111111111111111',
          destination: 'rDestAcct' + ((idx + j + 3) % 9) + '1111111111111111111111',
          amountDisplay: spec.amt,
          amountXrpEstimate: spec.est,
          currency: spec.txType === 'OfferCreate' ? 'RLUSD' : undefined,
          issuer: spec.txType === 'OfferCreate' ? 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' : undefined,
          feeDrops: 12,
          validated: j !== 0,
          engineResult: 'tesSUCCESS',
          ledgerIndex: 108612480,
          timestamp: Date.now(),
          isWhale: spec.whale,
        };
        listeners.tx.forEach((cb) => cb(tx));
      }
      idx++;
    };
    emitBatch();
    setInterval(emitBatch, 350);
  }, 250);
})();
`;

async function run() {
  await fs.mkdir(outDir, { recursive: true });
  const preloadPath = path.join(rootDir, 'scripts', '.tmp-showcase-preload.cjs');
  await fs.writeFile(preloadPath, SHOWCASE_PRELOAD_JS, 'utf8');

  const capWin = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    frame: false,
    backgroundColor: '#050914',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  await capWin.loadFile(path.join(rootDir, 'dist', 'index.html'));
  await delay(2600);

  const snap = async (filename) => {
    const img = await capWin.webContents.capturePage();
    await fs.writeFile(path.join(outDir, filename), img.toPNG());
    console.log('[capture]', filename);
  };

  const clickNavByText = async (label) => {
    await capWin.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('aside button'));
        const target = btns.find((b) => b.textContent && b.textContent.includes(${JSON.stringify(label)}));
        if (target) target.click();
      })();
    `);
  };

  // 1. Command Deck
  await snap('01-command-deck.png');

  // 2. Wallets & DeFi
  await clickNavByText('Wallets & DeFi');
  await delay(1400);
  await snap('02-wallets-defi.png');

  // 3. 3D Globe
  await clickNavByText('3D Globe');
  await delay(2200);
  await snap('03-3d-globe.png');

  // 4. Tokens & DEX (click first RLUSD tile to show CLOB vs AMM Radar + IL Simulator)
  await clickNavByText('Tokens & DEX');
  await delay(1200);
  await capWin.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('main button'));
      const rlusd = btns.find((b) => b.textContent && b.textContent.includes('RLUSD'));
      if (rlusd) rlusd.click();
    })();
  `);
  await delay(1400);
  await snap('04-tokens-dex-amm.png');

  // 5. NFT Studio
  await clickNavByText('NFT Studio');
  await delay(1400);
  await snap('05-nft-studio.png');

  // 6. Vaults & Lending (open Waterfall Simulator sub-tab for rich visual!)
  await clickNavByText('Vaults & Lending');
  await delay(1200);
  await capWin.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('main button'));
      const sim = btns.find((b) => b.textContent && b.textContent.includes('Waterfall Simulator'));
      if (sim) sim.click();
    })();
  `);
  await delay(900);
  await snap('06-vaults-lending.png');

  // 7. My Node Ops (click Poll Node so Node Health Doctor + 14 Peers show live!)
  await clickNavByText('My Node Ops');
  await delay(1000);
  await capWin.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('main button'));
      const poll = btns.find((b) => b.textContent && b.textContent.includes('Poll Node'));
      if (poll) poll.click();
    })();
  `);
  await delay(1200);
  await snap('07-node-ops.png');

  // 8. XRPL Academy — Interactive Visual Animations
  await clickNavByText('XRPL Academy');
  await delay(1000);
  await capWin.webContents.executeJavaScript(`
    (() => {
      const btns = Array.from(document.querySelectorAll('main button'));
      const anim = btns.find((b) => b.textContent && b.textContent.includes('Interactive Animations'));
      if (anim) anim.click();
    })();
  `);
  await delay(1600);
  await snap('08-xrpl-academy-animations.png');

  await fs.rm(preloadPath, { force: true });
  capWin.destroy();
  app.quit();
}

app.whenReady().then(run).catch((err) => {
  console.error(err);
  app.exit(1);
});
