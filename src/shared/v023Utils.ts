import type { TokenOnLedgerReport, WalletPortfolioSnapshot, WalletTxIntent } from './types';

// ============================================================================
// Track 1: XRPL Developer RPC Console Presets & Validator
// ============================================================================

export interface RpcPlaygroundPreset {
  id: string;
  label: string;
  command: string;
  description: string;
  params: Record<string, unknown>;
}

export const RPC_PLAYGROUND_PRESETS: RpcPlaygroundPreset[] = [
  {
    id: 'server_info',
    label: 'server_info',
    command: 'server_info',
    description: 'Connected node version, validated ledger range, quorum & load factor',
    params: {},
  },
  {
    id: 'fee',
    label: 'fee',
    command: 'fee',
    description: 'Live open-ledger fee escalation, median fee & queue capacity',
    params: {},
  },
  {
    id: 'account_info',
    label: 'account_info',
    command: 'account_info',
    description: 'Inspect AccountRoot balance, sequence, owner count & flags',
    params: {
      account: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      ledger_index: 'validated',
      signer_lists: true,
    },
  },
  {
    id: 'account_objects',
    label: 'account_objects',
    command: 'account_objects',
    description: 'List TrustLines, Offers, Escrows, Checks & SignerLists owned by an account',
    params: {
      account: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      ledger_index: 'validated',
      limit: 25,
    },
  },
  {
    id: 'amm_info',
    label: 'amm_info',
    command: 'amm_info',
    description: 'Query XLS-30 AMM pool reserves, LP supply & trading fee',
    params: {
      asset: { currency: 'XRP' },
      asset2: {
        currency: '524C555344000000000000000000000000000000',
        issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      },
      ledger_index: 'validated',
    },
  },
  {
    id: 'book_offers',
    label: 'book_offers',
    command: 'book_offers',
    description: 'Fetch top CLOB DEX orderbook offers for XRP vs an issued token',
    params: {
      taker_gets: { currency: 'XRP' },
      taker_pays: {
        currency: '524C555344000000000000000000000000000000',
        issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      },
      limit: 10,
      ledger_index: 'validated',
    },
  },
  {
    id: 'gateway_balances',
    label: 'gateway_balances',
    command: 'gateway_balances',
    description: 'Total issued token obligations and hot-wallet balances for an issuer',
    params: {
      account: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      ledger_index: 'validated',
      strict: true,
    },
  },
  {
    id: 'ledger_entry',
    label: 'ledger_entry',
    command: 'ledger_entry',
    description: 'Inspect raw AccountRoot or ledger object by address / index',
    params: {
      account_root: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      ledger_index: 'validated',
    },
  },
];

export function validateRpcJsonParams(
  rawJson: string
): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { ok: true, params: {} };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'RPC params must be a JSON object (e.g. { "ledger_index": "validated" }).' };
    }
    return { ok: true, params: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// Track 2: Live CLOB vs. AMM Spread & Liquidity Radar
// ============================================================================

export interface ClobVsAmmSpreadReport {
  hasClob: boolean;
  hasAmm: boolean;
  clobBestBidXrp: number | null;
  clobBestAskXrp: number | null;
  clobMidPriceXrp: number | null;
  clobBidAskSpreadPct: number | null;
  ammSpotPriceXrp: number | null;
  ammTradingFeeBps: number | null;
  /** Signed percentage: (ammSpot - clobMid) / clobMid * 100 */
  clobVsAmmDiffPct: number | null;
  /** Absolute spread percentage between CLOB mid and AMM spot */
  absSpreadPct: number | null;
  /** Positive net arbitrage edge after subtracting AMM trading fee (%) */
  netArbEdgePct: number | null;
  cheaperVenue: 'AMM' | 'CLOB' | 'PARITY' | 'INSUFFICIENT_DATA';
  summary: string;
}

export function computeClobVsAmmSpread(report: TokenOnLedgerReport): ClobVsAmmSpreadReport {
  const bestBid =
    report.bids.length > 0 && Number.isFinite(report.bids[0].price) && report.bids[0].price > 0
      ? report.bids[0].price
      : null;
  const bestAsk =
    report.asks.length > 0 && Number.isFinite(report.asks[0].price) && report.asks[0].price > 0
      ? report.asks[0].price
      : null;

  let clobMid: number | null = null;
  if (bestBid !== null && bestAsk !== null) {
    clobMid = (bestBid + bestAsk) / 2;
  } else if (bestBid !== null) {
    clobMid = bestBid;
  } else if (bestAsk !== null) {
    clobMid = bestAsk;
  }

  const clobBidAskSpreadPct =
    bestBid !== null && bestAsk !== null && clobMid !== null && clobMid > 0
      ? Number((((bestAsk - bestBid) / clobMid) * 100).toFixed(3))
      : null;

  const ammXrp = report.amm?.asset1Numeric;
  const ammTok = report.amm?.asset2Numeric;
  const hasAmm = Boolean(
    report.amm &&
      typeof ammXrp === 'number' &&
      typeof ammTok === 'number' &&
      Number.isFinite(ammXrp) &&
      Number.isFinite(ammTok) &&
      ammXrp > 0 &&
      ammTok > 0
  );

  // Price in XRP per 1 Token (matching CLOB orderbook price convention)
  const ammSpotPriceXrp = hasAmm ? (ammXrp as number) / (ammTok as number) : null;
  // Note: tokenOnLedgerReport.amm.tradingFeeBps is stored as percentage (e.g. 0.30 = 30 bps) or bps;
  // check directoryService/xrplStream: trading_fee (0..1000) / 1000 * 100 = percent (0..1%).
  // Convert percentage (e.g. 0.30%) cleanly to bps (30 bps) when <= 1, else treat as bps.
  const rawFee = report.amm?.tradingFeeBps ?? null;
  const ammTradingFeeBps =
    rawFee !== null && Number.isFinite(rawFee)
      ? rawFee <= 1.05
        ? Number((rawFee * 100).toFixed(1))
        : Number(rawFee.toFixed(1))
      : null;

  const hasClob = clobMid !== null && clobMid > 0;

  if (!hasClob || !hasAmm || ammSpotPriceXrp === null || clobMid === null) {
    return {
      hasClob,
      hasAmm,
      clobBestBidXrp: bestBid,
      clobBestAskXrp: bestAsk,
      clobMidPriceXrp: clobMid,
      clobBidAskSpreadPct,
      ammSpotPriceXrp,
      ammTradingFeeBps,
      clobVsAmmDiffPct: null,
      absSpreadPct: null,
      netArbEdgePct: null,
      cheaperVenue: 'INSUFFICIENT_DATA',
      summary: !hasAmm
        ? 'No active XLS-30 AMM pool — pricing is CLOB-only.'
        : 'Orderbook depth is empty — pricing is AMM-only.',
    };
  }

  const diffPct = ((ammSpotPriceXrp - clobMid) / clobMid) * 100;
  const absSpreadPct = Math.abs(diffPct);
  const feePct = (ammTradingFeeBps ?? 0) / 100;
  const netArbEdgePct = Number(Math.max(0, absSpreadPct - feePct).toFixed(3));

  let cheaperVenue: ClobVsAmmSpreadReport['cheaperVenue'] = 'PARITY';
  if (absSpreadPct >= 0.05) {
    cheaperVenue = ammSpotPriceXrp < clobMid ? 'AMM' : 'CLOB';
  }

  const summary =
    cheaperVenue === 'PARITY'
      ? 'CLOB and AMM are tightly aligned (<0.05% spread).'
      : cheaperVenue === 'AMM'
        ? `AMM spot is ${absSpreadPct.toFixed(2)}% cheaper than CLOB mid (${netArbEdgePct > 0 ? `+${netArbEdgePct.toFixed(2)}% net after LP fee` : 'within LP fee band'}).`
        : `CLOB mid is ${absSpreadPct.toFixed(2)}% cheaper than AMM spot (${netArbEdgePct > 0 ? `+${netArbEdgePct.toFixed(2)}% net after LP fee` : 'within LP fee band'}).`;

  return {
    hasClob,
    hasAmm,
    clobBestBidXrp: bestBid,
    clobBestAskXrp: bestAsk,
    clobMidPriceXrp: clobMid,
    clobBidAskSpreadPct,
    ammSpotPriceXrp,
    ammTradingFeeBps,
    clobVsAmmDiffPct: Number(diffPct.toFixed(3)),
    absSpreadPct: Number(absSpreadPct.toFixed(3)),
    netArbEdgePct,
    cheaperVenue,
    summary,
  };
}

// ============================================================================
// Track 3A: Multi-Tranche Escrow Vesting Schedule Builder
// ============================================================================

export interface EscrowVestingParams {
  account: string;
  destination: string;
  totalXrp: number;
  trancheCount: number;
  intervalDays: number;
  startUnixMs: number;
  cancelBufferDays?: number;
  destinationTag?: number;
  memoPrefix?: string;
}

export interface EscrowVestingTranche {
  index: number;
  amountXrp: string;
  finishAfterUnixMs: number;
  cancelAfterUnixMs?: number;
  unlockDateIso: string;
  intent: Extract<WalletTxIntent, { kind: 'EscrowCreate' }>;
}

export interface EscrowVestingScheduleResult {
  ok: boolean;
  error?: string;
  tranches: EscrowVestingTranche[];
  totalXrp: number;
  additionalReserveXrp: number;
  estimatedNetworkFeeXrp: number;
}

export function buildEscrowVestingSchedule(params: EscrowVestingParams): EscrowVestingScheduleResult {
  const {
    account,
    destination,
    totalXrp,
    trancheCount,
    intervalDays,
    startUnixMs,
    cancelBufferDays,
    destinationTag,
    memoPrefix,
  } = params;

  if (!account.trim() || !destination.trim()) {
    return {
      ok: false,
      error: 'Both sender account and destination address are required.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }
  if (!Number.isFinite(totalXrp) || totalXrp <= 0) {
    return {
      ok: false,
      error: 'Total XRP to vest must be greater than 0.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }
  if (!Number.isInteger(trancheCount) || trancheCount < 2 || trancheCount > 24) {
    return {
      ok: false,
      error: 'Tranche count must be a whole number between 2 and 24.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }
  if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return {
      ok: false,
      error: 'Interval days must be between 1 and 365.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }
  if (!Number.isFinite(startUnixMs) || startUnixMs <= 0) {
    return {
      ok: false,
      error: 'Start date timestamp is invalid.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }

  // Compute exact drops so all tranches sum precisely to totalXrp with zero floating-point drift
  const totalDrops = Math.round(totalXrp * 1_000_000);
  if (totalDrops < trancheCount) {
    return {
      ok: false,
      error: 'Total XRP is too small to split across the requested tranches.',
      tranches: [],
      totalXrp: 0,
      additionalReserveXrp: 0,
      estimatedNetworkFeeXrp: 0,
    };
  }

  const baseDrops = Math.floor(totalDrops / trancheCount);
  const remainderDrops = totalDrops - baseDrops * trancheCount;
  const dayMs = 86_400_000;
  const cleanPrefix = (memoPrefix ?? 'Vesting Tranche').trim();

  const tranches: EscrowVestingTranche[] = [];
  for (let i = 0; i < trancheCount; i++) {
    const trancheDrops = baseDrops + (i === trancheCount - 1 ? remainderDrops : 0);
    const amountXrp = Number((trancheDrops / 1_000_000).toFixed(6)).toString();
    const finishAfterUnixMs = startUnixMs + i * intervalDays * dayMs;
    const cancelAfterUnixMs =
      cancelBufferDays && cancelBufferDays > 0
        ? finishAfterUnixMs + cancelBufferDays * dayMs
        : undefined;

    const intent: Extract<WalletTxIntent, { kind: 'EscrowCreate' }> = {
      kind: 'EscrowCreate',
      account: account.trim(),
      destination: destination.trim(),
      amountXrp,
      finishAfterUnixMs,
      cancelAfterUnixMs,
      destinationTag,
      memoText: `${cleanPrefix} ${i + 1}/${trancheCount}`,
    };

    tranches.push({
      index: i + 1,
      amountXrp,
      finishAfterUnixMs,
      cancelAfterUnixMs,
      unlockDateIso: new Date(finishAfterUnixMs).toISOString().slice(0, 10),
      intent,
    });
  }

  return {
    ok: true,
    tranches,
    totalXrp: Number((totalDrops / 1_000_000).toFixed(6)),
    additionalReserveXrp: Number((trancheCount * 0.2).toFixed(2)),
    estimatedNetworkFeeXrp: Number((trancheCount * 0.000012).toFixed(6)),
  };
}

// ============================================================================
// Track 3B: Exportable Account Security & Reserve Audit Report (Markdown)
// ============================================================================

export function buildAccountSecurityAuditMarkdown(
  portfolio: WalletPortfolioSnapshot,
  opts: {
    label?: string;
    networkLabel: string;
    xrpUsd: number | null;
    generatedAtIso?: string;
  }
): string {
  const ts = opts.generatedAtIso ?? new Date().toISOString();
  const lockedXrp = Number((portfolio.baseReserveXrp + portfolio.ownerReserveXrp).toFixed(4));
  const usdSuffix = (xrp: number) =>
    opts.xrpUsd !== null && Number.isFinite(opts.xrpUsd)
      ? ` (~$${(xrp * opts.xrpUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`
      : '';

  const findings: string[] = [];
  if (portfolio.flags.blackholed) {
    findings.push('**Immutable / Blackholed:** Master key disabled and RegularKey set to blackhole address.');
  } else if (portfolio.flags.disableMaster) {
    findings.push('**Master Key Disabled:** Signing requires active RegularKey or Multi-Sig SignerList.');
  } else {
    findings.push('**Standard Master Key Active:** Keep seed offline; consider hardware signing or Multi-Sig for high-value treasuries.');
  }
  if (portfolio.flags.requireDestTag) {
    findings.push('**RequireDestTag Enabled:** Incoming payments without a Destination Tag will be rejected.');
  }
  if (portfolio.flags.globalFreeze) {
    findings.push('**WARNING — GlobalFreeze Enabled:** All issued TrustLines are currently frozen.');
  }
  if (portfolio.flags.allowClawback) {
    findings.push('**Clawback Enabled:** Issuer retains XLS-39 clawback capability on issued IOUs.');
  }
  if (portfolio.flags.noFreeze) {
    findings.push('**NoFreeze Enforced:** Account has permanently relinquished freeze privileges.');
  }
  if (portfolio.signerList) {
    findings.push(
      `**Multi-Sig Active:** Quorum \`${portfolio.signerList.signerQuorum}\` across ${portfolio.signerList.signers.length} registered signer(s).`
    );
  }
  const zeroBalanceTls = portfolio.tokens.filter((t) => Number(t.balance) === 0).length;
  if (zeroBalanceTls > 0) {
    findings.push(
      `**Reserve Optimization:** ${zeroBalanceTls} zero-balance TrustLine(s) detected — removing them frees \`${(zeroBalanceTls * 0.2).toFixed(1)} XRP\`.`
    );
  }

  const lines: string[] = [
    `# XRPL Account Security & Reserve Audit Report`,
    '',
    `- **Generated:** ${ts}`,
    `- **Network:** ${opts.networkLabel}`,
    `- **Wallet Label:** ${opts.label ?? 'Unnamed Account'}`,
    `- **Classic Address:** \`${portfolio.address}\``,
    `- **Account Funded:** ${portfolio.funded ? 'Yes' : 'No (Unfunded / Reserve Inactive)'}`,
    `- **Sequence:** \`${portfolio.sequence}\``,
    portfolio.domain ? `- **On-Ledger Domain:** \`${portfolio.domain}\`` : '',
    '',
    `## 1. Balance & Reserve Breakdown`,
    '',
    `| Metric | Amount |`,
    `| :--- | :--- |`,
    `| **Total Balance** | ${portfolio.totalXrpDisplay} XRP${usdSuffix(portfolio.totalXrp)} |`,
    `| **Spendable Balance** | ${portfolio.spendableXrp.toLocaleString()} XRP${usdSuffix(portfolio.spendableXrp)} |`,
    `| **Total Locked Reserve** | ${lockedXrp} XRP (${portfolio.baseReserveXrp} base + ${portfolio.ownerCount} objects × 0.2 XRP) |`,
    '',
    `## 2. Security Flags & Governance Posture`,
    '',
    `| Flag | State |`,
    `| :--- | :--- |`,
    `| Blackholed | ${portfolio.flags.blackholed ? 'YES' : 'NO'} |`,
    `| Master Key Disabled | ${portfolio.flags.disableMaster ? 'YES' : 'NO'} |`,
    `| Regular Key | ${portfolio.flags.regularKey ? `\`${portfolio.flags.regularKey}\`` : 'None'} |`,
    `| Multi-Sig SignerList | ${portfolio.signerList ? `Quorum ${portfolio.signerList.signerQuorum} (${portfolio.signerList.signers.length} signers)` : 'None'} |`,
    `| DefaultRipple | ${portfolio.flags.defaultRipple ? 'ON' : 'OFF'} |`,
    `| RequireDestTag | ${portfolio.flags.requireDestTag ? 'ON' : 'OFF'} |`,
    `| RequireAuth | ${portfolio.flags.requireAuth ? 'ON' : 'OFF'} |`,
    `| DepositAuth | ${portfolio.flags.depositAuth ? 'ON' : 'OFF'} |`,
    `| GlobalFreeze | ${portfolio.flags.globalFreeze ? 'ON' : 'OFF'} |`,
    `| NoFreeze | ${portfolio.flags.noFreeze ? 'ON' : 'OFF'} |`,
    `| AllowClawback | ${portfolio.flags.allowClawback ? 'ON' : 'OFF'} |`,
    '',
    `## 3. Audit Highlights & Recommendations`,
    '',
    ...findings.map((f) => `- ${f}`),
    '',
    `## 4. Owned Ledger Objects Summary`,
    '',
    `- **TrustLines:** ${portfolio.tokens.length}`,
    `- **Open DEX Offers:** ${portfolio.offers.length}`,
    `- **Active Escrows:** ${portfolio.escrows.length}`,
    `- **Active Checks:** ${portfolio.checks.length}`,
    `- **Owned XLS-20 NFTs:** ${portfolio.nfts.length}`,
    '',
  ];

  if (portfolio.tokens.length > 0) {
    lines.push(
      `### TrustLines (${portfolio.tokens.length})`,
      '',
      `| Currency | Issuer | Balance | Limit | Frozen |`,
      `| :--- | :--- | ---: | ---: | :---: |`,
      ...portfolio.tokens.map(
        (t) =>
          `| \`${t.currency}\` | \`${t.issuer}\` | ${t.balance} | ${t.limit} | ${t.freeze ? 'YES' : 'NO'} |`
      ),
      ''
    );
  }

  if (portfolio.escrows.length > 0) {
    lines.push(
      `### Active Escrows (${portfolio.escrows.length})`,
      '',
      `| Amount | Destination | Unlock (UTC) | Seq |`,
      `| ---: | :--- | :--- | ---: |`,
      ...portfolio.escrows.map(
        (e) =>
          `| ${e.amountXrp} XRP | \`${e.destination}\` | ${e.finishAfterMs ? new Date(e.finishAfterMs).toISOString() : 'Condition'} | ${e.offerSequence ?? '—'} |`
      ),
      ''
    );
  }

  lines.push(
    `---`,
    `*Generated locally by XRPL Command Center. No private keys, seeds, or vault passphrases are included in this report.*`
  );

  return lines.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
}
