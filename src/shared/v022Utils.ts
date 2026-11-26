import { serializeRowsToCsv } from './studioUtils';
import type {
  WalletAccountPublic,
  WalletGroupTag,
  WalletTxIntent,
} from './types';

export interface BatchPayoutRow {
  lineNumber: number;
  destination: string;
  amount: string;
  numericAmount: number;
  destinationTag?: number;
}

export interface BatchPayoutParseResult {
  validRows: BatchPayoutRow[];
  invalidRows: Array<{ lineNumber: number; raw: string; reason: string }>;
  totalAmount: number;
  uniqueRecipients: number;
  estimatedFeesXrp: number;
}

export interface BatchPayoutReceiptRow {
  destination: string;
  amount: string;
  currency: string;
  destinationTag?: number;
  status: 'success' | 'failed' | 'skipped';
  hash?: string;
  error?: string;
}

export interface TxDryRunSimulation {
  projectedResult: 'tesSUCCESS' | 'tecUNFUNDED_PAYMENT' | 'tecINSUFFICIENT_RESERVE' | 'tecDST_TAG_NEEDED';
  xrpDelta: number;
  reserveDeltaXrp: number;
  objectsAffected: string[];
  warnings: string[];
}

export const WALLET_GROUP_META: Record<
  WalletGroupTag,
  { label: string; badgeClass: string }
> = {
  general: { label: 'General', badgeClass: 'bg-slate-800 border-slate-700 text-slate-300' },
  'cold-storage': { label: 'Cold Storage', badgeClass: 'bg-violet-500/15 border-violet-400/40 text-violet-200' },
  'defi-hot': { label: 'DeFi Hot', badgeClass: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200' },
  'issuer-treasury': { label: 'Issuer / Treasury', badgeClass: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' },
  testnet: { label: 'Testnet', badgeClass: 'bg-amber-500/15 border-amber-400/40 text-amber-200' },
};

const CLASSIC_ADDR_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

/**
 * Parse CSV/TSV/newline batch airdrop list: `r-address,amount[,destination_tag]`
 */
export function parseBatchPayoutCsv(input: string, feeDropsPerTx = 12): BatchPayoutParseResult {
  const lines = input.split(/\r?\n/);
  const validRows: BatchPayoutRow[] = [];
  const invalidRows: Array<{ lineNumber: number; raw: string; reason: string }> = [];
  const recipients = new Set<string>();
  let totalAmount = 0;

  let seenContentLine = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    // Skip header row if present on the first non-empty/non-comment line
    const parts = raw.split(/[,\t;]+/).map((p) => p.trim());
    if (
      !seenContentLine &&
      /address|destination|recipient/i.test(parts[0] ?? '') &&
      (!parts[1] || !Number.isFinite(Number(parts[1])))
    ) {
      seenContentLine = true;
      continue;
    }
    seenContentLine = true;
    const dest = parts[0] ?? '';
    const amtStr = parts[1] ?? '';
    const tagStr = parts[2] ?? '';

    if (!CLASSIC_ADDR_RE.test(dest)) {
      invalidRows.push({ lineNumber: i + 1, raw, reason: 'Invalid XRPL classic r-address' });
      continue;
    }

    const num = Number(amtStr);
    if (!amtStr || !Number.isFinite(num) || num <= 0) {
      invalidRows.push({ lineNumber: i + 1, raw, reason: 'Amount must be a positive number' });
      continue;
    }

    let parsedTag: number | undefined;
    if (tagStr) {
      if (!/^\d+$/.test(tagStr) || Number(tagStr) > 4_294_967_295) {
        invalidRows.push({ lineNumber: i + 1, raw, reason: 'Invalid Destination Tag (must be uint32)' });
        continue;
      }
      parsedTag = Number(tagStr);
    }

    validRows.push({
      lineNumber: i + 1,
      destination: dest,
      amount: amtStr,
      numericAmount: num,
      destinationTag: parsedTag,
    });
    recipients.add(dest);
    totalAmount += num;
  }

  return {
    validRows,
    invalidRows,
    totalAmount: Number(totalAmount.toFixed(6)),
    uniqueRecipients: recipients.size,
    estimatedFeesXrp: Number(((validRows.length * feeDropsPerTx) / 1_000_000).toFixed(6)),
  };
}

export function buildPayoutReceiptCsv(rows: BatchPayoutReceiptRow[]): string {
  return serializeRowsToCsv(
    ['Destination', 'Amount', 'Currency', 'DestinationTag', 'Status', 'TxHash', 'Error'],
    rows.map((r) => [
      r.destination,
      r.amount,
      r.currency,
      r.destinationTag ?? '',
      r.status,
      r.hash ?? '',
      r.error ?? '',
    ])
  );
}

/**
 * Deterministic pre-flight dry-run simulation for any WalletTxIntent.
 * Projects exact XRP delta, reserve delta, ledger objects affected, and likely engine result.
 */
export function simulateTxDryRun(
  intent: WalletTxIntent,
  spendableXrp: number | null,
  feeDrops = 12,
  destRequiresTag = false
): TxDryRunSimulation {
  const feeXrp = feeDrops / 1_000_000;
  const warnings: string[] = [];
  let xrpOut = 0;
  let reserveDeltaXrp = 0;
  const objectsAffected: string[] = [];

  switch (intent.kind) {
    case 'Payment': {
      if (intent.asset.currency.toUpperCase() === 'XRP') {
        xrpOut = Number(intent.asset.value) || 0;
      }
      objectsAffected.push('AccountRoot (Sender & Recipient balances)');
      if (destRequiresTag && intent.destinationTag === undefined) {
        warnings.push('Recipient account has lsfRequireDestTag enabled — add a Destination Tag.');
        return {
          projectedResult: 'tecDST_TAG_NEEDED',
          xrpDelta: Number((-(xrpOut + feeXrp)).toFixed(6)),
          reserveDeltaXrp: 0,
          objectsAffected,
          warnings,
        };
      }
      break;
    }
    case 'TrustSet': {
      const lim = Number(intent.limit);
      reserveDeltaXrp = lim === 0 ? -0.2 : 0.2;
      objectsAffected.push(lim === 0 ? 'Remove RippleState TrustLine (-0.2 XRP reserve)' : 'Create/Update RippleState TrustLine (+0.2 XRP reserve)');
      break;
    }
    case 'OfferCreate': {
      reserveDeltaXrp = 0.2;
      if (intent.takerGets.currency.toUpperCase() === 'XRP') {
        xrpOut = Number(intent.takerGets.value) || 0;
      }
      objectsAffected.push('Create DEX Offer object (+0.2 XRP reserve)');
      break;
    }
    case 'OfferCancel': {
      reserveDeltaXrp = -0.2;
      objectsAffected.push('Remove DEX Offer object (-0.2 XRP reserve)');
      break;
    }
    case 'AMMCreate': {
      reserveDeltaXrp = 0.2;
      if (intent.amount1.currency.toUpperCase() === 'XRP') xrpOut += Number(intent.amount1.value) || 0;
      if (intent.amount2.currency.toUpperCase() === 'XRP') xrpOut += Number(intent.amount2.value) || 0;
      objectsAffected.push('Create XLS-30 AMM Pool + LP Token TrustLine (+0.2 XRP reserve)');
      break;
    }
    case 'AMMDeposit': {
      if (intent.amount1.currency.toUpperCase() === 'XRP') xrpOut += Number(intent.amount1.value) || 0;
      if (intent.amount2?.currency.toUpperCase() === 'XRP') xrpOut += Number(intent.amount2.value) || 0;
      objectsAffected.push('Update AMM Pool liquidity & LP Token balance');
      break;
    }
    case 'EscrowCreate': {
      xrpOut = Number(intent.amountXrp) || 0;
      reserveDeltaXrp = 0.2;
      objectsAffected.push('Create Time-Locked Escrow object (+0.2 XRP reserve)');
      break;
    }
    case 'CheckCreate': {
      reserveDeltaXrp = 0.2;
      objectsAffected.push('Create Deferred Check object (+0.2 XRP reserve)');
      break;
    }
    case 'NFTokenMint': {
      reserveDeltaXrp = 0.2;
      objectsAffected.push('Mint XLS-20 NFToken (up to +0.2 XRP per 32-NFT page)');
      break;
    }
    case 'MPTokenIssuanceCreate': {
      reserveDeltaXrp = 0.2;
      objectsAffected.push('Create XLS-33 MPTokenIssuance (+0.2 XRP reserve)');
      break;
    }
    default: {
      objectsAffected.push(`Ledger state update (${intent.kind})`);
      break;
    }
  }

  const totalNeeded = xrpOut + feeXrp + Math.max(0, reserveDeltaXrp);
  let projectedResult: TxDryRunSimulation['projectedResult'] = 'tesSUCCESS';

  if (spendableXrp !== null && xrpOut + feeXrp > spendableXrp) {
    projectedResult = 'tecUNFUNDED_PAYMENT';
    warnings.push(`Requires ~${(xrpOut + feeXrp).toFixed(4)} XRP, but spendable balance is ${spendableXrp.toFixed(4)} XRP.`);
  } else if (spendableXrp !== null && totalNeeded > spendableXrp) {
    projectedResult = 'tecINSUFFICIENT_RESERVE';
    warnings.push(`Insufficient spendable XRP to cover the +${reserveDeltaXrp.toFixed(2)} XRP object reserve.`);
  }

  return {
    projectedResult,
    xrpDelta: Number((-(xrpOut + feeXrp)).toFixed(6)),
    reserveDeltaXrp,
    objectsAffected,
    warnings,
  };
}

export function computeGroupTotals(
  accounts: WalletAccountPublic[],
  balancesMap: Record<string, number>,
  groupsMap: Record<string, WalletGroupTag>,
  xrpUsd: number | null
): Array<{ group: WalletGroupTag; count: number; totalXrp: number; totalUsd: number | null }> {
  const acc = new Map<WalletGroupTag, { count: number; totalXrp: number }>();

  for (const acct of accounts) {
    const g: WalletGroupTag = groupsMap[acct.id] ?? 'general';
    const cur = acc.get(g) ?? { count: 0, totalXrp: 0 };
    cur.count += 1;
    cur.totalXrp += balancesMap[acct.address] ?? 0;
    acc.set(g, cur);
  }

  return Array.from(acc.entries()).map(([group, data]) => ({
    group,
    count: data.count,
    totalXrp: Number(data.totalXrp.toFixed(4)),
    totalUsd: xrpUsd !== null ? Number((data.totalXrp * xrpUsd).toFixed(2)) : null,
  }));
}
