import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  decode,
  ECDSA,
  encode,
  encodeForMultiSigning,
  encodeForSigning,
  isValidClassicAddress,
  multisign,
  Wallet,
} from 'xrpl';
import type { RustVaultSidecarClient } from './rustVaultClient';
import type {
  AssetSpec,
  LiveTransaction,
  NetworkId,
  PathFindQuote,
  SignerListInfo,
  TxPreflightPreview,
  TxSubmitResult,
  VaultStatus,
  WalletAccountPublic,
  WalletAlgorithm,
  WalletCheckEntry,
  WalletEscrowEntry,
  WalletNftEntry,
  WalletOpenOffer,
  WalletPortfolioSnapshot,
  WalletTokenBalance,
  WalletTxIntent,
} from '../src/shared/types';
import {
  decodeCurrencyCode,
  decodeHexAscii,
  decodeIssuerRiskFlags,
  dropsToXrpNumber,
  dropsToXrpString,
  encodeCurrencyCode,
  formatXrplAmount,
  isIssuedAmount,
  parseLiveTransactionEvent,
  rippleTimeToUnixMs,
  unixMsToRippleTime,
  utf8ToHex,
  xrpToDropsString,
} from '../src/shared/xrplCodec';
import type { XrplStreamManager } from './xrplStream';

export interface OsCipherAdapter {
  isAvailable: () => boolean;
  encrypt: (plainText: string) => Buffer;
  decrypt: (cipherBuf: Buffer) => string;
}

interface EncryptedSeedPayload {
  verifier: 'XRPL_CC_VAULT_V1';
  seeds: Record<string, string>;
}

interface VaultDiskFile {
  version: 1;
  vaultInitialized: boolean;
  osWrapped: boolean;
  saltHex?: string;
  ivHex?: string;
  authTagHex?: string;
  ciphertextB64?: string;
  accounts: WalletAccountPublic[];
}

const VAULT_FILENAME = 'wallet-vault.enc.json';
const AUTO_LOCK_MS = 15 * 60 * 1000;
const MAX_SAFE_FEE_DROPS = 5_000;

export function formatAssetForXrpl(
  asset: AssetSpec
): string | { currency: string; issuer: string; value: string } {
  const cur = asset.currency.trim();
  if (cur.toUpperCase() === 'XRP') {
    return xrpToDropsString(asset.value);
  }
  if (!asset.issuer || !isValidClassicAddress(asset.issuer.trim())) {
    throw new Error(`Valid issuer r-address required for token "${cur}"`);
  }
  const val = String(asset.value).trim();
  if (!/^\d+(\.\d+)?$/.test(val) || Number(val) < 0) {
    throw new Error(`Invalid token amount "${val}"`);
  }
  return {
    currency: encodeCurrencyCode(cur),
    issuer: asset.issuer.trim(),
    value: val,
  };
}

function formatAmmCurrencySpec(spec: {
  currency: string;
  issuer?: string;
}): { currency: string; issuer?: string } {
  if (spec.currency.trim().toUpperCase() === 'XRP') {
    return { currency: 'XRP' };
  }
  if (!spec.issuer || !isValidClassicAddress(spec.issuer.trim())) {
    throw new Error(`Valid issuer r-address required for AMM asset "${spec.currency}"`);
  }
  return {
    currency: encodeCurrencyCode(spec.currency),
    issuer: spec.issuer.trim(),
  };
}

export function buildXrplTransactionFromIntent(intent: WalletTxIntent): {
  tx: Record<string, unknown>;
  summaryLines: Array<{ label: string; value: string }>;
} {
  const memosHelper = (memoText?: string) =>
    memoText && memoText.trim().length > 0
      ? [
          {
            Memo: {
              MemoType: utf8ToHex('text/plain'),
              MemoData: utf8ToHex(memoText.trim()),
            },
          },
        ]
      : undefined;

  switch (intent.kind) {
    case 'Payment': {
      if (!isValidClassicAddress(intent.destination.trim())) {
        throw new Error('Invalid destination XRPL classic r-address');
      }
      const amount = formatAssetForXrpl(intent.asset);
      const tx: Record<string, unknown> = {
        TransactionType: 'Payment',
        Account: intent.account,
        Destination: intent.destination.trim(),
        Amount: amount,
      };
      if (intent.sendMax) {
        tx.SendMax = formatAssetForXrpl(intent.sendMax);
      }
      if (intent.deliverMin) {
        tx.DeliverMin = formatAssetForXrpl(intent.deliverMin);
        tx.Flags = 0x00020000; // tfPartialPayment paired with DeliverMin for slippage protection
      }
      if (intent.paths && intent.paths.length > 0) {
        tx.Paths = intent.paths;
      }
      if (intent.destinationTag !== undefined && Number.isInteger(intent.destinationTag) && intent.destinationTag >= 0) {
        tx.DestinationTag = intent.destinationTag;
      }
      const memos = memosHelper(intent.memoText);
      if (memos) tx.Memos = memos;

      return {
        tx,
        summaryLines: [
          { label: 'Action', value: intent.deliverMin ? 'Smart Pathfinding Swap (Payment)' : 'Payment' },
          { label: 'From', value: intent.account },
          { label: 'Destination', value: intent.destination.trim() },
          {
            label: 'Target Amount',
            value:
              typeof amount === 'string'
                ? `${dropsToXrpString(amount, 6)} XRP`
                : `${amount.value} ${decodeCurrencyCode(amount.currency)}`,
          },
          ...(tx.SendMax ? [{ label: 'Max Spend (SendMax)', value: formatXrplAmount(tx.SendMax) }] : []),
          ...(tx.DeliverMin ? [{ label: 'Min Received (DeliverMin)', value: formatXrplAmount(tx.DeliverMin) }] : []),
          ...(tx.DestinationTag !== undefined
            ? [{ label: 'Destination Tag', value: String(tx.DestinationTag) }]
            : []),
        ],
      };
    }

    case 'TrustSet': {
      if (!isValidClassicAddress(intent.issuer.trim())) {
        throw new Error('Invalid token issuer r-address');
      }
      const currency = encodeCurrencyCode(intent.currency);
      const flags = intent.allowRippling ? 0x00040000 : 0x00020000;
      const tx: Record<string, unknown> = {
        TransactionType: 'TrustSet',
        Account: intent.account,
        LimitAmount: {
          currency,
          issuer: intent.issuer.trim(),
          value: String(intent.limit).trim(),
        },
        Flags: flags,
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: Number(intent.limit) === 0 ? 'Remove TrustLine' : 'Set TrustLine' },
          { label: 'Asset', value: `${decodeCurrencyCode(currency)} (${intent.issuer.trim()})` },
          { label: 'Limit', value: String(intent.limit).trim() },
          { label: 'NoRipple', value: intent.allowRippling ? 'Disabled (Rippling ON)' : 'Enabled (Safe Default)' },
        ],
      };
    }

    case 'OfferCreate': {
      const takerGets = formatAssetForXrpl(intent.takerGets);
      const takerPays = formatAssetForXrpl(intent.takerPays);
      let flags = 0;
      if (intent.orderMode === 'passive') flags = 0x00010000;
      else if (intent.orderMode === 'ioc') flags = 0x00020000;
      else if (intent.orderMode === 'fok') flags = 0x00040000;

      const tx: Record<string, unknown> = {
        TransactionType: 'OfferCreate',
        Account: intent.account,
        TakerGets: takerGets,
        TakerPays: takerPays,
        ...(flags ? { Flags: flags } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: `DEX Order (${(intent.orderMode ?? 'limit').toUpperCase()})` },
          { label: 'You Give (Sell)', value: formatXrplAmount(takerGets) },
          { label: 'You Receive (Buy)', value: formatXrplAmount(takerPays) },
        ],
      };
    }

    case 'OfferCancel': {
      const tx: Record<string, unknown> = {
        TransactionType: 'OfferCancel',
        Account: intent.account,
        OfferSequence: intent.offerSequence,
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Cancel Open DEX Offer' },
          { label: 'Offer Sequence', value: `#${intent.offerSequence}` },
        ],
      };
    }

    case 'AMMCreate': {
      const amount = formatAssetForXrpl(intent.amount1);
      const amount2 = formatAssetForXrpl(intent.amount2);
      const tradingFee = Math.max(0, Math.min(1000, Math.round(intent.tradingFeeBps * 10)));
      const tx: Record<string, unknown> = {
        TransactionType: 'AMMCreate',
        Account: intent.account,
        Amount: amount,
        Amount2: amount2,
        TradingFee: tradingFee,
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Create XLS-30 AMM Pool' },
          { label: 'Seed Asset 1', value: formatXrplAmount(amount) },
          { label: 'Seed Asset 2', value: formatXrplAmount(amount2) },
          { label: 'Trading Fee', value: `${(tradingFee / 1000).toFixed(2)}%` },
        ],
      };
    }

    case 'AMMVote': {
      const asset = formatAmmCurrencySpec(intent.asset1);
      const asset2 = formatAmmCurrencySpec(intent.asset2);
      const tradingFee = Math.max(0, Math.min(1000, Math.round(intent.tradingFeeBps * 10)));
      const tx: Record<string, unknown> = {
        TransactionType: 'AMMVote',
        Account: intent.account,
        Asset: asset,
        Asset2: asset2,
        TradingFee: tradingFee,
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'AMM LP Trading Fee Vote' },
          { label: 'Pool', value: `${decodeCurrencyCode(asset.currency)} / ${decodeCurrencyCode(asset2.currency)}` },
          { label: 'Proposed Fee', value: `${(tradingFee / 1000).toFixed(2)}% (${intent.tradingFeeBps} bps)` },
        ],
      };
    }

    case 'AMMDeposit': {
      const asset = formatAmmCurrencySpec(intent.asset1);
      const asset2 = formatAmmCurrencySpec(intent.asset2);
      const amount = formatAssetForXrpl(intent.amount1);
      const tx: Record<string, unknown> = {
        TransactionType: 'AMMDeposit',
        Account: intent.account,
        Asset: asset,
        Asset2: asset2,
        Amount: amount,
      };
      if (intent.amount2 && Number(intent.amount2.value) > 0) {
        tx.Amount2 = formatAssetForXrpl(intent.amount2);
        tx.Flags = 0x00100000;
      } else {
        tx.Flags = 0x00080000;
      }
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: tx.Amount2 ? 'AMM Dual-Asset Deposit' : 'AMM Single-Asset Deposit' },
          { label: 'Pool', value: `${decodeCurrencyCode(asset.currency)} / ${decodeCurrencyCode(asset2.currency)}` },
          { label: 'Deposit 1', value: formatXrplAmount(amount) },
          ...(tx.Amount2 ? [{ label: 'Deposit 2', value: formatXrplAmount(tx.Amount2) }] : []),
        ],
      };
    }

    case 'AMMWithdraw': {
      const asset = formatAmmCurrencySpec(intent.asset1);
      const asset2 = formatAmmCurrencySpec(intent.asset2);
      const tx: Record<string, unknown> = {
        TransactionType: 'AMMWithdraw',
        Account: intent.account,
        Asset: asset,
        Asset2: asset2,
      };
      if (intent.withdrawAll) {
        tx.Flags = 0x00020000;
      } else if (intent.amount1) {
        tx.Amount = formatAssetForXrpl(intent.amount1);
        tx.Flags = 0x00080000;
      } else {
        throw new Error('Specify an amount to withdraw or enable Withdraw All');
      }
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: intent.withdrawAll ? 'AMM Withdraw All LP' : 'AMM Single-Asset Withdraw' },
          { label: 'Pool', value: `${decodeCurrencyCode(asset.currency)} / ${decodeCurrencyCode(asset2.currency)}` },
        ],
      };
    }

    case 'EscrowCreate': {
      if (!isValidClassicAddress(intent.destination.trim())) {
        throw new Error('Invalid escrow destination r-address');
      }
      const drops = xrpToDropsString(intent.amountXrp);
      const finishAfter = unixMsToRippleTime(intent.finishAfterUnixMs);
      const tx: Record<string, unknown> = {
        TransactionType: 'EscrowCreate',
        Account: intent.account,
        Destination: intent.destination.trim(),
        Amount: drops,
        FinishAfter: finishAfter,
      };
      if (intent.cancelAfterUnixMs) {
        const cancelAfter = unixMsToRippleTime(intent.cancelAfterUnixMs);
        if (cancelAfter <= finishAfter) {
          throw new Error('CancelAfter must be strictly later than FinishAfter');
        }
        tx.CancelAfter = cancelAfter;
      }
      if (intent.destinationTag !== undefined && Number.isInteger(intent.destinationTag) && intent.destinationTag >= 0) {
        tx.DestinationTag = intent.destinationTag;
      }
      const memos = memosHelper(intent.memoText);
      if (memos) tx.Memos = memos;

      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Create Time-Locked XRP Escrow' },
          { label: 'Destination', value: intent.destination.trim() },
          { label: 'Locked XRP', value: `${dropsToXrpString(drops, 6)} XRP` },
          { label: 'Unlocks At', value: new Date(intent.finishAfterUnixMs).toLocaleString() },
        ],
      };
    }

    case 'EscrowFinish': {
      return {
        tx: {
          TransactionType: 'EscrowFinish',
          Account: intent.account,
          Owner: intent.owner.trim(),
          OfferSequence: intent.offerSequence,
        },
        summaryLines: [
          { label: 'Action', value: 'Finish / Release Unlocked Escrow' },
          { label: 'Escrow Owner', value: intent.owner.trim() },
          { label: 'Offer Sequence', value: `#${intent.offerSequence}` },
        ],
      };
    }

    case 'EscrowCancel': {
      return {
        tx: {
          TransactionType: 'EscrowCancel',
          Account: intent.account,
          Owner: intent.owner.trim(),
          OfferSequence: intent.offerSequence,
        },
        summaryLines: [
          { label: 'Action', value: 'Cancel Expired Escrow' },
          { label: 'Escrow Owner', value: intent.owner.trim() },
          { label: 'Offer Sequence', value: `#${intent.offerSequence}` },
        ],
      };
    }

    case 'CheckCreate': {
      if (!isValidClassicAddress(intent.destination.trim())) {
        throw new Error('Invalid check destination r-address');
      }
      const sendMax = formatAssetForXrpl(intent.sendMax);
      const tx: Record<string, unknown> = {
        TransactionType: 'CheckCreate',
        Account: intent.account,
        Destination: intent.destination.trim(),
        SendMax: sendMax,
      };
      if (intent.destinationTag !== undefined && Number.isInteger(intent.destinationTag) && intent.destinationTag >= 0) {
        tx.DestinationTag = intent.destinationTag;
      }
      if (intent.expirationUnixMs) {
        tx.Expiration = unixMsToRippleTime(intent.expirationUnixMs);
      }
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Create Deferred Check' },
          { label: 'Recipient', value: intent.destination.trim() },
          { label: 'Max Amount', value: formatXrplAmount(sendMax) },
        ],
      };
    }

    case 'CheckCash': {
      const amount = formatAssetForXrpl(intent.amount);
      return {
        tx: {
          TransactionType: 'CheckCash',
          Account: intent.account,
          CheckID: intent.checkId.trim(),
          Amount: amount,
        },
        summaryLines: [
          { label: 'Action', value: 'Cash Incoming Check' },
          { label: 'Check ID', value: `${intent.checkId.slice(0, 12)}…` },
          { label: 'Amount', value: formatXrplAmount(amount) },
        ],
      };
    }

    case 'CheckCancel': {
      return {
        tx: {
          TransactionType: 'CheckCancel',
          Account: intent.account,
          CheckID: intent.checkId.trim(),
        },
        summaryLines: [
          { label: 'Action', value: 'Cancel Check' },
          { label: 'Check ID', value: `${intent.checkId.slice(0, 12)}…` },
        ],
      };
    }

    case 'NFTokenMint': {
      const flags = (intent.burnable ? 0x00000001 : 0) | (intent.transferable ? 0x00000008 : 0);
      const transferFeeUnits = intent.transferable
        ? Math.max(0, Math.min(50_000, Math.round(intent.transferFeeBps * 10)))
        : 0;
      const tx: Record<string, unknown> = {
        TransactionType: 'NFTokenMint',
        Account: intent.account,
        NFTokenTaxon: Math.max(0, Math.floor(intent.taxon || 0)),
        Flags: flags,
        ...(transferFeeUnits > 0 ? { TransferFee: transferFeeUnits } : {}),
        ...(intent.uriText.trim() ? { URI: utf8ToHex(intent.uriText.trim()) } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Mint XLS-20 NFToken' },
          { label: 'URI', value: intent.uriText.trim() || '(empty)' },
          { label: 'Taxon', value: String(tx.NFTokenTaxon) },
          { label: 'Royalty', value: `${(transferFeeUnits / 1000).toFixed(2)}%` },
        ],
      };
    }

    case 'NFTokenCreateOffer': {
      const amtTrim = String(intent.amountXrp).trim();
      const drops = amtTrim === '0' || amtTrim === '0.0' ? '0' : xrpToDropsString(amtTrim);
      const tx: Record<string, unknown> = {
        TransactionType: 'NFTokenCreateOffer',
        Account: intent.account,
        NFTokenID: intent.nftokenId.trim(),
        Amount: drops,
        ...(intent.isSellOffer ? { Flags: 0x00000001 } : {}),
      };
      if (intent.destination && intent.destination.trim()) {
        if (!isValidClassicAddress(intent.destination.trim())) {
          throw new Error('Invalid NFT offer destination r-address');
        }
        tx.Destination = intent.destination.trim();
      }
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: intent.isSellOffer ? 'Create NFT Sell / Transfer Offer' : 'Create NFT Buy Offer' },
          { label: 'NFToken ID', value: `${intent.nftokenId.slice(0, 12)}…` },
          { label: 'Price', value: drops === '0' ? '0 XRP (Free Transfer)' : `${dropsToXrpString(drops, 4)} XRP` },
        ],
      };
    }

    case 'NFTokenBurn': {
      return {
        tx: {
          TransactionType: 'NFTokenBurn',
          Account: intent.account,
          NFTokenID: intent.nftokenId.trim(),
        },
        summaryLines: [
          { label: 'Action', value: 'Burn NFToken Permanently' },
          { label: 'NFToken ID', value: `${intent.nftokenId.slice(0, 12)}…` },
        ],
      };
    }

    case 'SignerListSet': {
      if (intent.signerQuorum < 0) {
        throw new Error('SignerQuorum must be >= 0 (0 deletes the SignerList)');
      }
      const entries =
        intent.signerQuorum === 0
          ? undefined
          : intent.signers.map((s) => {
              if (!isValidClassicAddress(s.account.trim())) {
                throw new Error(`Invalid signer classic r-address: ${s.account}`);
              }
              return {
                SignerEntry: {
                  Account: s.account.trim(),
                  SignerWeight: Math.max(1, Math.floor(s.weight)),
                },
              };
            });
      const totalWeight = intent.signers.reduce((acc, s) => acc + Math.max(1, Math.floor(s.weight)), 0);
      if (intent.signerQuorum > 0 && totalWeight < intent.signerQuorum) {
        throw new Error(`Total signer weights (${totalWeight}) must be >= SignerQuorum (${intent.signerQuorum})`);
      }

      const tx: Record<string, unknown> = {
        TransactionType: 'SignerListSet',
        Account: intent.account,
        SignerQuorum: Math.floor(intent.signerQuorum),
        ...(entries ? { SignerEntries: entries } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: intent.signerQuorum === 0 ? 'Remove Multi-Sig SignerList' : 'Configure Multi-Sig SignerList' },
          { label: 'Signer Quorum', value: String(intent.signerQuorum) },
          { label: 'Signers Count', value: String(intent.signers.length) },
        ],
      };
    }

    case 'AccountSet': {
      const tx: Record<string, unknown> = {
        TransactionType: 'AccountSet',
        Account: intent.account,
      };
      if (intent.domain !== undefined) {
        tx.Domain = intent.domain.trim() ? utf8ToHex(intent.domain.trim().toLowerCase()) : '';
      }
      // AccountSet SetFlag values: 8 = asfDefaultRipple, 1 = asfRequireDest, 16 = asfAllowTrustLineClawback
      if (intent.enableDefaultRipple) tx.SetFlag = 8;
      else if (intent.enableRequireDest) tx.SetFlag = 1;
      else if (intent.enableAllowClawback) tx.SetFlag = 16;

      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Update AccountRoot Settings (`AccountSet`)' },
          ...(intent.domain !== undefined ? [{ label: 'Domain', value: intent.domain || '(clear)' }] : []),
          ...(tx.SetFlag ? [{ label: 'SetFlag', value: String(tx.SetFlag) }] : []),
        ],
      };
    }

    case 'MPTokenIssuanceCreate': {
      let flags = 0;
      if (intent.canLock) flags |= 0x00000002;
      if (intent.requireAuth) flags |= 0x00000004;
      if (intent.canEscrow) flags |= 0x00000008;
      if (intent.canTrade) flags |= 0x00000010;
      if (intent.canTransfer) flags |= 0x00000020;
      if (intent.canClawback) flags |= 0x00000040;

      const transferFee = intent.canTransfer && intent.transferFeeBps
        ? Math.max(0, Math.min(50_000, Math.round(intent.transferFeeBps * 10)))
        : 0;

      const tx: Record<string, unknown> = {
        TransactionType: 'MPTokenIssuanceCreate',
        Account: intent.account,
        AssetScale: Math.max(0, Math.min(19, Math.floor(intent.assetScale || 0))),
        Flags: flags,
        ...(intent.maximumAmount?.trim() ? { MaximumAmount: intent.maximumAmount.trim() } : {}),
        ...(transferFee > 0 ? { TransferFee: transferFee } : {}),
        ...(intent.metadataText?.trim() ? { MPTokenMetadata: utf8ToHex(intent.metadataText.trim()) } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Create Multi-Purpose Token Issuance (MPT)' },
          { label: 'Asset Scale', value: String(tx.AssetScale) },
          { label: 'Max Supply', value: intent.maximumAmount?.trim() || 'Unlimited' },
        ],
      };
    }

    case 'MPTokenAuthorize': {
      const tx: Record<string, unknown> = {
        TransactionType: 'MPTokenAuthorize',
        Account: intent.account,
        MPTokenIssuanceID: intent.mptIssuanceId.trim(),
        ...(intent.holder?.trim() ? { Holder: intent.holder.trim() } : {}),
        ...(intent.unauthorize ? { Flags: 0x00000001 } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: intent.unauthorize ? 'Unauthorize MPToken' : 'Authorize / Opt-In MPToken' },
          { label: 'Issuance ID', value: `${intent.mptIssuanceId.slice(0, 14)}…` },
        ],
      };
    }

    case 'Clawback': {
      if (!isValidClassicAddress(intent.holder.trim())) {
        throw new Error('Invalid holder r-address for Clawback');
      }
      const currency = encodeCurrencyCode(intent.currency);
      const tx: Record<string, unknown> = {
        TransactionType: 'Clawback',
        Account: intent.account,
        Amount: {
          currency,
          issuer: intent.holder.trim(), // Per XLS-39 Clawback spec, Amount.issuer specifies the token holder
          value: intent.value.trim(),
        },
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Regulated Issuer Clawback' },
          { label: 'Holder', value: intent.holder.trim() },
          { label: 'Amount', value: `${intent.value.trim()} ${decodeCurrencyCode(currency)}` },
        ],
      };
    }

    case 'OracleSet': {
      const tx: Record<string, unknown> = {
        TransactionType: 'OracleSet',
        Account: intent.account,
        OracleDocumentID: Math.max(0, Math.floor(intent.oracleDocumentId)),
        Provider: utf8ToHex(intent.provider.trim() || 'XRPL-CC'),
        AssetClass: utf8ToHex(intent.assetClass.trim() || 'currency'),
        LastUpdateTime: Math.floor(Date.now() / 1000),
        PriceDataSeries: [
          {
            PriceData: {
              BaseAsset: encodeCurrencyCode(intent.baseAsset),
              QuoteAsset: encodeCurrencyCode(intent.quoteAsset),
              AssetPrice: Math.max(0, Math.round(intent.assetPrice)),
              Scale: Math.max(0, Math.min(10, Math.floor(intent.scale))),
            },
          },
        ],
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Publish XLS-47 On-Ledger Price Oracle' },
          { label: 'Pair', value: `${intent.baseAsset}/${intent.quoteAsset}` },
          {
            label: 'Scaled Price',
            value: String(intent.assetPrice / Math.pow(10, Math.max(0, Math.floor(intent.scale)))),
          },
        ],
      };
    }

    case 'OracleDelete': {
      return {
        tx: {
          TransactionType: 'OracleDelete',
          Account: intent.account,
          OracleDocumentID: Math.max(0, Math.floor(intent.oracleDocumentId)),
        },
        summaryLines: [
          { label: 'Action', value: 'Delete Price Oracle Document' },
          { label: 'Document ID', value: String(intent.oracleDocumentId) },
        ],
      };
    }

    case 'DIDSet': {
      const tx: Record<string, unknown> = {
        TransactionType: 'DIDSet',
        Account: intent.account,
        ...(intent.uri?.trim() ? { URI: utf8ToHex(intent.uri.trim()) } : {}),
        ...(intent.didDocument?.trim() ? { DIDDocument: utf8ToHex(intent.didDocument.trim()) } : {}),
        ...(intent.dataText?.trim() ? { Data: utf8ToHex(intent.dataText.trim()) } : {}),
      };
      return {
        tx,
        summaryLines: [
          { label: 'Action', value: 'Publish XLS-40 Decentralized Identity (`DIDSet`)' },
          { label: 'DID', value: `did:xrpl:${intent.account}` },
          ...(intent.uri?.trim() ? [{ label: 'URI', value: intent.uri.trim() }] : []),
        ],
      };
    }

    case 'DIDDelete': {
      return {
        tx: {
          TransactionType: 'DIDDelete',
          Account: intent.account,
        },
        summaryLines: [{ label: 'Action', value: 'Delete On-Ledger DID (`DIDDelete`)' }],
      };
    }
  }
}

export class WalletVaultService {
  private unlockedSeeds: Map<string, string> | null = null;
  private activePassphraseKey: Buffer | null = null;
  private activeSalt: Buffer | null = null;
  private autoLockTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly storageDir: string,
    private readonly osCipher?: OsCipherAdapter,
    private readonly rustSidecar?: RustVaultSidecarClient | null
  ) {}

  private get vaultPath(): string {
    return path.join(this.storageDir, VAULT_FILENAME);
  }

  private touchAutoLock(): void {
    if (this.autoLockTimer) clearTimeout(this.autoLockTimer);
    this.autoLockTimer = setTimeout(() => {
      this.lock();
    }, AUTO_LOCK_MS);
    if (typeof this.autoLockTimer.unref === 'function') {
      this.autoLockTimer.unref();
    }
  }

  private isOsKeychainAvailable(): boolean {
    try {
      return Boolean(this.osCipher?.isAvailable());
    } catch {
      return false;
    }
  }

  private async loadDiskFile(): Promise<VaultDiskFile> {
    try {
      const raw = await fs.readFile(this.vaultPath, 'utf8');
      const parsed = JSON.parse(raw) as VaultDiskFile;
      return {
        version: 1,
        vaultInitialized: Boolean(parsed.vaultInitialized),
        osWrapped: Boolean(parsed.osWrapped),
        saltHex: parsed.saltHex,
        ivHex: parsed.ivHex,
        authTagHex: parsed.authTagHex,
        ciphertextB64: parsed.ciphertextB64,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      };
    } catch {
      return {
        version: 1,
        vaultInitialized: false,
        osWrapped: false,
        accounts: [],
      };
    }
  }

  private async saveDiskFile(data: VaultDiskFile): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const tmpPath = `${this.vaultPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmpPath, this.vaultPath);
  }

  private derivePassphraseKey(passphrase: string, salt: Buffer): Buffer {
    return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  }

  private encryptSeeds(seedsMap: Map<string, string>, key: Buffer, salt: Buffer): {
    osWrapped: boolean;
    saltHex: string;
    ivHex: string;
    authTagHex: string;
    ciphertextB64: string;
  } {
    const payload: EncryptedSeedPayload = {
      verifier: 'XRPL_CC_VAULT_V1',
      seeds: Object.fromEntries(seedsMap.entries()),
    };
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const baseB64 = enc.toString('base64');
    if (this.isOsKeychainAvailable() && this.osCipher) {
      const wrapped = this.osCipher.encrypt(baseB64);
      return {
        osWrapped: true,
        saltHex: salt.toString('hex'),
        ivHex: iv.toString('hex'),
        authTagHex: authTag.toString('hex'),
        ciphertextB64: wrapped.toString('base64'),
      };
    }

    return {
      osWrapped: false,
      saltHex: salt.toString('hex'),
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      ciphertextB64: baseB64,
    };
  }

  private decryptSeeds(disk: VaultDiskFile, passphrase: string): {
    key: Buffer;
    salt: Buffer;
    seeds: Map<string, string>;
  } {
    if (!disk.vaultInitialized || !disk.saltHex || !disk.ivHex || !disk.authTagHex || !disk.ciphertextB64) {
      throw new Error('Encrypted vault has not been initialized yet.');
    }

    const salt = Buffer.from(disk.saltHex, 'hex');
    const iv = Buffer.from(disk.ivHex, 'hex');
    const authTag = Buffer.from(disk.authTagHex, 'hex');
    const key = this.derivePassphraseKey(passphrase, salt);

    let innerB64 = disk.ciphertextB64;
    if (disk.osWrapped) {
      if (!this.osCipher || !this.isOsKeychainAvailable()) {
        throw new Error('OS Keychain required to unwrap this vault is currently unavailable.');
      }
      innerB64 = this.osCipher.decrypt(Buffer.from(disk.ciphertextB64, 'base64'));
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let plain: string;
    try {
      const dec = Buffer.concat([
        decipher.update(Buffer.from(innerB64, 'base64')),
        decipher.final(),
      ]);
      plain = dec.toString('utf8');
    } catch {
      throw new Error('Incorrect vault passphrase.');
    }

    const parsed = JSON.parse(plain) as EncryptedSeedPayload;
    if (parsed.verifier !== 'XRPL_CC_VAULT_V1' || typeof parsed.seeds !== 'object') {
      throw new Error('Vault integrity verification failed.');
    }

    return {
      key,
      salt,
      seeds: new Map(Object.entries(parsed.seeds)),
    };
  }

  public async getStatus(): Promise<VaultStatus> {
    if (this.rustSidecar) {
      return this.rustSidecar.getStatus();
    }
    const disk = await this.loadDiskFile();
    return {
      initialized: disk.vaultInitialized,
      unlocked: this.unlockedSeeds !== null,
      osKeychainAvailable: this.isOsKeychainAvailable(),
      backend: 'node-fallback',
      kdf: 'scrypt+aes-256-gcm',
      accounts: disk.accounts,
    };
  }

  public async setupVault(passphrase: string): Promise<{ ok: boolean; status?: VaultStatus; error?: string }> {
    if (this.rustSidecar) {
      try {
        const status = await this.rustSidecar.setupVault(passphrase);
        this.touchAutoLock();
        return { ok: true, status };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Rust vault setup failed' };
      }
    }
    if (!passphrase || passphrase.length < 8) {
      return { ok: false, error: 'Master passphrase must be at least 8 characters.' };
    }
    const disk = await this.loadDiskFile();
    if (disk.vaultInitialized) {
      return { ok: false, error: 'Vault is already initialized. Unlock it with your passphrase.' };
    }

    const salt = crypto.randomBytes(32);
    const key = this.derivePassphraseKey(passphrase, salt);
    const seeds = new Map<string, string>();
    const enc = this.encryptSeeds(seeds, key, salt);

    await this.saveDiskFile({
      version: 1,
      vaultInitialized: true,
      ...enc,
      accounts: disk.accounts,
    });

    this.unlockedSeeds = seeds;
    this.activePassphraseKey = key;
    this.activeSalt = salt;
    this.touchAutoLock();

    return { ok: true, status: await this.getStatus() };
  }

  public async unlock(passphrase: string): Promise<{ ok: boolean; status?: VaultStatus; error?: string }> {
    if (this.rustSidecar) {
      try {
        const status = await this.rustSidecar.unlock(passphrase);
        this.touchAutoLock();
        return { ok: true, status };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to unlock Rust vault' };
      }
    }
    try {
      const disk = await this.loadDiskFile();
      const { key, salt, seeds } = this.decryptSeeds(disk, passphrase);
      this.unlockedSeeds = seeds;
      this.activePassphraseKey = key;
      this.activeSalt = salt;
      this.touchAutoLock();
      return { ok: true, status: await this.getStatus() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to unlock vault' };
    }
  }

  public lock(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    if (this.rustSidecar && this.rustSidecar.isRunning()) {
      void this.rustSidecar.lock().catch(() => undefined);
    }
    if (this.unlockedSeeds) {
      this.unlockedSeeds.clear();
      this.unlockedSeeds = null;
    }
    if (this.activePassphraseKey) {
      this.activePassphraseKey.fill(0);
      this.activePassphraseKey = null;
    }
    this.activeSalt = null;
  }

  private async persistUnlockedCustodial(accounts: WalletAccountPublic[]): Promise<void> {
    if (!this.unlockedSeeds || !this.activePassphraseKey || !this.activeSalt) {
      throw new Error('Vault is locked.');
    }
    const enc = this.encryptSeeds(this.unlockedSeeds, this.activePassphraseKey, this.activeSalt);
    await this.saveDiskFile({
      version: 1,
      vaultInitialized: true,
      ...enc,
      accounts,
    });
  }

  public async createWallet(
    label: string,
    algorithm: WalletAlgorithm = 'ed25519'
  ): Promise<{
    ok: boolean;
    account?: WalletAccountPublic;
    oneTimeSeed?: string;
    status?: VaultStatus;
    error?: string;
  }> {
    if (this.rustSidecar) {
      try {
        this.touchAutoLock();
        const created = await this.rustSidecar.createWallet(label, algorithm);
        return { ok: true, ...created };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Rust wallet creation failed' };
      }
    }
    if (!this.unlockedSeeds) {
      return { ok: false, error: 'Unlock or initialize your encrypted vault before creating a signing wallet.' };
    }
    this.touchAutoLock();

    const ecdsaAlgo = algorithm === 'ecdsa-secp256k1' ? ECDSA.secp256k1 : ECDSA.ed25519;
    const wallet = Wallet.generate(ecdsaAlgo);
    if (!wallet.seed) {
      return { ok: false, error: 'Failed to generate XRPL wallet seed.' };
    }

    const disk = await this.loadDiskFile();
    const id = `w-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const account: WalletAccountPublic = {
      id,
      label: label.trim() || `XRPL Wallet ${disk.accounts.length + 1}`,
      address: wallet.classicAddress,
      kind: 'custodial',
      algorithm,
      createdAt: Date.now(),
    };

    this.unlockedSeeds.set(id, wallet.seed);
    const nextAccounts = [account, ...disk.accounts];
    await this.persistUnlockedCustodial(nextAccounts);

    return {
      ok: true,
      account,
      oneTimeSeed: wallet.seed,
      status: await this.getStatus(),
    };
  }

  public async importSeed(
    label: string,
    seedInput: string
  ): Promise<{ ok: boolean; account?: WalletAccountPublic; status?: VaultStatus; error?: string }> {
    if (this.rustSidecar) {
      try {
        this.touchAutoLock();
        const res = await this.rustSidecar.importSeed(label, seedInput);
        return { ok: true, ...res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Rust seed import failed' };
      }
    }
    if (!this.unlockedSeeds) {
      return { ok: false, error: 'Unlock your encrypted vault before importing a seed.' };
    }
    this.touchAutoLock();

    const cleanSeed = seedInput.trim();
    const detectedAlgo = cleanSeed.startsWith('sEd') ? ECDSA.ed25519 : ECDSA.secp256k1;
    let wallet: Wallet;
    try {
      wallet = Wallet.fromSeed(cleanSeed, { algorithm: detectedAlgo });
    } catch {
      return { ok: false, error: 'Invalid XRPL family seed (expected sEd… or s… format).' };
    }

    const disk = await this.loadDiskFile();
    const existing = disk.accounts.find((a) => a.address === wallet.classicAddress);
    if (existing && existing.kind === 'custodial') {
      return { ok: false, error: `Wallet ${wallet.classicAddress} is already in your vault.` };
    }

    const id = existing?.id ?? `w-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const algorithm: WalletAlgorithm = cleanSeed.startsWith('sEd') ? 'ed25519' : 'ecdsa-secp256k1';
    const account: WalletAccountPublic = {
      id,
      label: label.trim() || existing?.label || `Imported ${wallet.classicAddress.slice(0, 6)}`,
      address: wallet.classicAddress,
      kind: 'custodial',
      algorithm,
      createdAt: Date.now(),
    };

    this.unlockedSeeds.set(id, cleanSeed);
    const filtered = disk.accounts.filter((a) => a.id !== id);
    await this.persistUnlockedCustodial([account, ...filtered]);

    return { ok: true, account, status: await this.getStatus() };
  }

  public async addWatchOnly(
    label: string,
    addressInput: string,
    isHardwareLedger = false,
    derivationPath?: string
  ): Promise<{ ok: boolean; account?: WalletAccountPublic; status?: VaultStatus; error?: string }> {
    const addr = addressInput.trim();
    if (!isValidClassicAddress(addr)) {
      return { ok: false, error: 'Invalid XRPL classic r-address.' };
    }
    if (this.rustSidecar) {
      try {
        const res = await this.rustSidecar.addWatchOnly(label, addr, isHardwareLedger, derivationPath);
        return { ok: true, ...res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unable to add watch account' };
      }
    }

    const disk = await this.loadDiskFile();
    if (disk.accounts.some((a) => a.address === addr)) {
      return { ok: false, error: 'This address is already tracked in your wallet list.' };
    }

    const account: WalletAccountPublic = {
      id: `${isHardwareLedger ? 'ledger' : 'watch'}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      label: label.trim() || `${isHardwareLedger ? 'Ledger' : 'Watch'} ${addr.slice(0, 6)}`,
      address: addr,
      kind: isHardwareLedger ? 'hardware-ledger' : 'watch-only',
      derivationPath: derivationPath || (isHardwareLedger ? "44'/144'/0'/0/0" : undefined),
      createdAt: Date.now(),
    };

    await this.saveDiskFile({
      ...disk,
      accounts: [account, ...disk.accounts],
    });

    return { ok: true, account, status: await this.getStatus() };
  }

  public async removeAccount(walletId: string): Promise<VaultStatus> {
    if (this.rustSidecar) {
      return this.rustSidecar.removeAccount(walletId);
    }
    const disk = await this.loadDiskFile();
    const target = disk.accounts.find((a) => a.id === walletId);
    if (!target) return this.getStatus();

    const nextAccounts = disk.accounts.filter((a) => a.id !== walletId);
    if (target.kind === 'custodial' && this.unlockedSeeds) {
      this.unlockedSeeds.delete(walletId);
      await this.persistUnlockedCustodial(nextAccounts);
    } else {
      await this.saveDiskFile({
        ...disk,
        accounts: nextAccounts,
      });
    }
    return this.getStatus();
  }

  public async fundFromFaucet(
    address: string,
    networkId: NetworkId
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    if (!isValidClassicAddress(address)) {
      return { ok: false, error: 'Invalid XRPL address.' };
    }
    if (networkId !== 'testnet' && networkId !== 'devnet') {
      return {
        ok: false,
        error: 'Faucet funding is only available on XRPL Testnet or Devnet. Switch networks in the top bar first.',
      };
    }

    const faucetUrl =
      networkId === 'testnet'
        ? 'https://faucet.altnet.rippletest.net/accounts'
        : 'https://faucet.devnet.rippletest.net/accounts';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(faucetUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: address }),
      });
      if (!res.ok) {
        throw new Error(`Faucet HTTP ${res.status}`);
      }
      const data = (await res.json()) as { amount?: number | string };
      return {
        ok: true,
        message: `Funded ${address.slice(0, 8)}… via ${networkId.toUpperCase()} faucet${
          data.amount ? ` (${data.amount} test XRP)` : ''
        }. Allow ~4s for ledger validation.`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Faucet request failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async fetchPortfolio(
    stream: XrplStreamManager,
    address: string
  ): Promise<WalletPortfolioSnapshot> {
    const fetchedAt = Date.now();
    let qrSvg: string | undefined;
    try {
      qrSvg = await QRCode.toString(address, {
        type: 'svg',
        margin: 1,
        color: { dark: '#22d3ee', light: '#061022' },
      });
    } catch {
      // ignore
    }

    const [infoRes, serverRes, linesRes, offersRes, objectsRes, nftsRes, txRes] =
      await Promise.allSettled([
        stream.request('account_info', { account: address, ledger_index: 'validated' }),
        stream.request('server_info'),
        stream.request('account_lines', { account: address, limit: 100, ledger_index: 'validated' }),
        stream.request('account_offers', { account: address, limit: 50, ledger_index: 'validated' }),
        stream.request('account_objects', { account: address, limit: 80, ledger_index: 'validated' }),
        stream.request('account_nfts', { account: address, limit: 50, ledger_index: 'validated' }),
        stream.request('account_tx', { account: address, limit: 20 }),
      ]);

    let baseReserveXrp = 1;
    let incReserveXrp = 0.2;
    if (serverRes.status === 'fulfilled') {
      const sInfo = (serverRes.value.result as Record<string, unknown> | undefined)?.info as
        | Record<string, unknown>
        | undefined;
      const valLedger = sInfo?.validated_ledger as Record<string, unknown> | undefined;
      if (valLedger) {
        baseReserveXrp = Number(valLedger.reserve_base_xrp ?? 1);
        incReserveXrp = Number(valLedger.reserve_inc_xrp ?? 0.2);
      }
    }

    if (infoRes.status !== 'fulfilled') {
      const msg = infoRes.reason instanceof Error ? infoRes.reason.message : String(infoRes.reason);
      const unfunded = /actNotFound|Account not found/i.test(msg);
      return {
        address,
        funded: false,
        fetchedAt,
        totalXrp: 0,
        totalXrpDisplay: '0',
        baseReserveXrp,
        ownerReserveXrp: 0,
        spendableXrp: 0,
        sequence: 0,
        ownerCount: 0,
        flags: decodeIssuerRiskFlags(0),
        signerList: null,
        tokens: [],
        offers: [],
        escrows: [],
        checks: [],
        nfts: [],
        recentTransactions: [],
        qrSvg,
        error: unfunded
          ? `Unfunded XRPL account — send at least ${baseReserveXrp} XRP (or use the Testnet/Devnet Faucet) to activate on-ledger.`
          : msg,
      };
    }

    const acct = ((infoRes.value.result as Record<string, unknown>)?.account_data ?? {}) as Record<
      string,
      unknown
    >;
    const balanceDrops = String(acct.Balance ?? '0');
    const totalXrp = dropsToXrpNumber(balanceDrops);
    const ownerCount = Number(acct.OwnerCount ?? 0);
    const ownerReserveXrp = Number((ownerCount * incReserveXrp).toFixed(4));
    const spendableXrp = Math.max(0, Number((totalXrp - baseReserveXrp - ownerReserveXrp).toFixed(6)));
    const flags = decodeIssuerRiskFlags(
      Number(acct.Flags ?? 0),
      typeof acct.RegularKey === 'string' ? acct.RegularKey : undefined,
      typeof acct.Domain === 'string' ? acct.Domain : undefined
    );

    const tokens: WalletTokenBalance[] = [];
    if (linesRes.status === 'fulfilled') {
      const rawLines = ((linesRes.value.result as Record<string, unknown>)?.lines ?? []) as Array<
        Record<string, unknown>
      >;
      for (const l of rawLines) {
        const curRaw = String(l.currency ?? '');
        tokens.push({
          currency: decodeCurrencyCode(curRaw),
          currencyRaw: curRaw,
          issuer: String(l.account ?? ''),
          balance: String(l.balance ?? '0'),
          limit: String(l.limit ?? '0'),
          noRipple: Boolean(l.no_ripple),
          authorized: Boolean(l.authorized),
          freeze: Boolean(l.freeze),
        });
      }
    }

    const offers: WalletOpenOffer[] = [];
    if (offersRes.status === 'fulfilled') {
      const rawOffers = ((offersRes.value.result as Record<string, unknown>)?.offers ?? []) as Array<
        Record<string, unknown>
      >;
      for (const o of rawOffers) {
        offers.push({
          seq: Number(o.seq ?? 0),
          flags: Number(o.flags ?? 0),
          takerGetsDisplay: formatXrplAmount(o.taker_gets),
          takerPaysDisplay: formatXrplAmount(o.taker_pays),
          quality: typeof o.quality === 'string' ? o.quality : undefined,
          expiration: typeof o.expiration === 'number' ? rippleTimeToUnixMs(o.expiration) : undefined,
        });
      }
    }

    const escrows: WalletEscrowEntry[] = [];
    const checks: WalletCheckEntry[] = [];
    let signerList: SignerListInfo | null = null;

    if (objectsRes.status === 'fulfilled') {
      const objs = ((objectsRes.value.result as Record<string, unknown>)?.account_objects ?? []) as Array<
        Record<string, unknown>
      >;
      for (const obj of objs) {
        const entryType = String(obj.LedgerEntryType ?? '');
        if (entryType === 'Escrow') {
          escrows.push({
            index: String(obj.index ?? ''),
            account: String(obj.Account ?? ''),
            destination: String(obj.Destination ?? ''),
            amountXrp: dropsToXrpString(String(obj.Amount ?? '0'), 4),
            finishAfterMs:
              typeof obj.FinishAfter === 'number' ? rippleTimeToUnixMs(obj.FinishAfter) : undefined,
            cancelAfterMs:
              typeof obj.CancelAfter === 'number' ? rippleTimeToUnixMs(obj.CancelAfter) : undefined,
            offerSequence: typeof obj.OfferSequence === 'number' ? obj.OfferSequence : undefined,
            condition: typeof obj.Condition === 'string' ? obj.Condition : undefined,
          });
        } else if (entryType === 'Check') {
          const sendMaxRaw = obj.SendMax as string | { currency: string; issuer: string; value: string };
          checks.push({
            index: String(obj.index ?? ''),
            account: String(obj.Account ?? ''),
            destination: String(obj.Destination ?? ''),
            sendMaxDisplay: formatXrplAmount(sendMaxRaw),
            sendMaxRaw,
            sequence: Number(obj.Sequence ?? 0),
            expirationMs:
              typeof obj.Expiration === 'number' ? rippleTimeToUnixMs(obj.Expiration) : undefined,
            destinationTag:
              typeof obj.DestinationTag === 'number' ? obj.DestinationTag : undefined,
          });
        } else if (entryType === 'SignerList') {
          const entries = (obj.SignerEntries ?? []) as Array<{ SignerEntry?: { Account?: string; SignerWeight?: number } }>;
          signerList = {
            signerQuorum: Number(obj.SignerQuorum ?? 0),
            signers: entries.map((e) => ({
              account: String(e.SignerEntry?.Account ?? ''),
              weight: Number(e.SignerEntry?.SignerWeight ?? 1),
            })),
          };
        }
      }
    }

    const nfts: WalletNftEntry[] = [];
    if (nftsRes.status === 'fulfilled') {
      const rawNfts = ((nftsRes.value.result as Record<string, unknown>)?.account_nfts ?? []) as Array<
        Record<string, unknown>
      >;
      for (const n of rawNfts) {
        const uriHex = typeof n.URI === 'string' ? n.URI : undefined;
        nfts.push({
          nftokenId: String(n.NFTokenID ?? ''),
          issuer: String(n.Issuer ?? ''),
          taxon: Number(n.NFTokenTaxon ?? 0),
          serial: Number(n.nft_serial ?? 0),
          uriHex,
          uriDecoded: decodeHexAscii(uriHex),
          transferFeeBps: Number(n.TransferFee ?? 0) / 10,
          flags: Number(n.Flags ?? 0),
        });
      }
    }

    const recentTransactions: LiveTransaction[] = [];
    if (txRes.status === 'fulfilled') {
      const list = ((txRes.value.result as Record<string, unknown>)?.transactions ?? []) as Array<
        Record<string, unknown>
      >;
      for (const item of list) {
        const parsed = parseLiveTransactionEvent({
          transaction: item.tx ?? item.tx_json,
          validated: item.validated ?? true,
          ledger_index: (item.tx as Record<string, unknown> | undefined)?.ledger_index,
          engine_result: (item.meta as Record<string, unknown> | undefined)?.TransactionResult,
        });
        if (parsed) recentTransactions.push(parsed);
      }
    }

    return {
      address,
      funded: true,
      fetchedAt,
      totalXrp,
      totalXrpDisplay: dropsToXrpString(balanceDrops, 4),
      baseReserveXrp,
      ownerReserveXrp,
      spendableXrp,
      sequence: Number(acct.Sequence ?? 0),
      ownerCount,
      domain: flags.domain,
      flags,
      signerList,
      tokens,
      offers,
      escrows,
      checks,
      nfts,
      recentTransactions,
      qrSvg,
    };
  }

  public async findBestSwapPath(
    stream: XrplStreamManager,
    params: {
      sourceAccount: string;
      destinationAccount: string;
      destinationAsset: AssetSpec;
      slippagePct: number;
    }
  ): Promise<PathFindQuote> {
    try {
      const destAmount = formatAssetForXrpl(params.destinationAsset);
      const res = await stream.request('ripple_path_find', {
        source_account: params.sourceAccount.trim(),
        destination_account: params.destinationAccount.trim(),
        destination_amount: destAmount,
      });
      const alternatives = ((res.result as Record<string, unknown>)?.alternatives ?? []) as Array<
        Record<string, unknown>
      >;

      if (alternatives.length === 0) {
        return {
          ok: false,
          sourceAmountDisplay: '—',
          sendMaxSpec: params.destinationAsset,
          deliverMinSpec: params.destinationAsset,
          destinationAmountSpec: params.destinationAsset,
          hopsSummary: 'No paths found',
          error: 'No liquid path found across XRPL orderbooks or AMM pools for this pair/size.',
        };
      }

      const best = alternatives[0];
      const srcAmt = best.source_amount;
      const slipMult = 1 + Math.max(0.1, params.slippagePct) / 100;
      const minMult = Math.max(0.5, 1 - Math.max(0.1, params.slippagePct) / 100);

      let sendMaxSpec: AssetSpec;
      if (typeof srcAmt === 'string') {
        const srcXrp = dropsToXrpNumber(srcAmt);
        sendMaxSpec = {
          currency: 'XRP',
          value: (srcXrp * slipMult).toFixed(6),
        };
      } else if (isIssuedAmount(srcAmt)) {
        sendMaxSpec = {
          currency: srcAmt.currency,
          issuer: srcAmt.issuer,
          value: (Number(srcAmt.value) * slipMult).toPrecision(8),
        };
      } else {
        throw new Error('Unexpected source_amount in ripple_path_find response');
      }

      const deliverMinSpec: AssetSpec = {
        ...params.destinationAsset,
        value:
          params.destinationAsset.currency.toUpperCase() === 'XRP'
            ? (Number(params.destinationAsset.value) * minMult).toFixed(6)
            : (Number(params.destinationAsset.value) * minMult).toPrecision(8),
      };

      const pathsComputed = (best.paths_computed ?? []) as unknown[];

      return {
        ok: true,
        sourceAmountDisplay: formatXrplAmount(srcAmt),
        sendMaxSpec,
        deliverMinSpec,
        destinationAmountSpec: params.destinationAsset,
        pathsComputed,
        hopsSummary:
          pathsComputed.length > 0
            ? `${pathsComputed.length} liquidity route(s) via CLOB / Auto-Bridge / AMM`
            : 'Direct XRP / AMM route',
      };
    } catch (err) {
      return {
        ok: false,
        sourceAmountDisplay: '—',
        sendMaxSpec: params.destinationAsset,
        deliverMinSpec: params.destinationAsset,
        destinationAmountSpec: params.destinationAsset,
        hopsSummary: '',
        error: err instanceof Error ? err.message : 'ripple_path_find failed',
      };
    }
  }

  public async preflightTransaction(
    stream: XrplStreamManager,
    intent: WalletTxIntent
  ): Promise<TxPreflightPreview> {
    const streamStatus = stream.getStatus();
    const warnings: string[] = [];

    if (streamStatus.networkId === 'mainnet') {
      warnings.push(
        'LIVE MAINNET TRANSACTION: Real XRP / on-ledger assets will be permanently signed and broadcast.'
      );
    }

    let built: { tx: Record<string, unknown>; summaryLines: Array<{ label: string; value: string }> };
    try {
      built = buildXrplTransactionFromIntent(intent);
    } catch (err) {
      return {
        ok: false,
        networkId: streamStatus.networkId,
        endpoint: streamStatus.endpoint,
        txJson: {},
        feeDrops: '12',
        feeXrp: '0.000012',
        summaryLines: [],
        warnings,
        blockingError: err instanceof Error ? err.message : 'Invalid transaction parameters',
      };
    }

    const [acctRes, serverRes] = await Promise.allSettled([
      stream.request('account_info', { account: intent.account, ledger_index: 'current' }),
      stream.request('server_info'),
    ]);

    if (acctRes.status !== 'fulfilled') {
      const msg = acctRes.reason instanceof Error ? acctRes.reason.message : 'Unable to query sender account';
      return {
        ok: false,
        networkId: streamStatus.networkId,
        endpoint: streamStatus.endpoint,
        txJson: built.tx,
        feeDrops: '12',
        feeXrp: '0.000012',
        summaryLines: built.summaryLines,
        warnings,
        blockingError: /actNotFound/i.test(msg)
          ? 'Sender account is not funded on this network yet.'
          : msg,
      };
    }

    const acctData = ((acctRes.value.result as Record<string, unknown>)?.account_data ?? {}) as Record<
      string,
      unknown
    >;
    const sequence = Number(acctData.Sequence ?? 0);

    let feeDropsNum = intent.kind === 'AMMCreate' ? 200_000 : 12; // AMMCreate requires owner reserve / special fee awareness
    let lastLedgerSeq: number | undefined;
    let baseReserveXrp = 1;

    if (serverRes.status === 'fulfilled') {
      const info = ((serverRes.value.result as Record<string, unknown>)?.info ?? {}) as Record<
        string,
        unknown
      >;
      const valLedger = info.validated_ledger as Record<string, unknown> | undefined;
      if (valLedger) {
        const baseFeeXrp = Number(valLedger.base_fee_xrp ?? 0.00001);
        const loadFactor = Number(info.load_factor ?? 1);
        if (intent.kind === 'AMMCreate') {
          const incReserveDrops = Math.round(Number(valLedger.reserve_inc_xrp ?? 0.2) * 1_000_000);
          feeDropsNum = Math.max(incReserveDrops, 200_000);
          warnings.push(
            `AMMCreate burns one owner reserve increment (${dropsToXrpString(feeDropsNum, 2)} XRP) as anti-spam protocol fee.`
          );
        } else {
          feeDropsNum = Math.min(
            MAX_SAFE_FEE_DROPS,
            Math.max(12, Math.ceil(baseFeeXrp * 1_000_000 * loadFactor))
          );
        }
        if (typeof valLedger.seq === 'number') {
          lastLedgerSeq = valLedger.seq + 20;
        }
        baseReserveXrp = Number(valLedger.reserve_base_xrp ?? 1);
      }
    }

    let blockingError: string | undefined;

    if (intent.kind === 'Payment') {
      try {
        const destRes = await stream.request('account_info', {
          account: intent.destination.trim(),
          ledger_index: 'validated',
        });
        const destAcct = ((destRes.result as Record<string, unknown>)?.account_data ?? {}) as Record<
          string,
          unknown
        >;
        const destFlags = decodeIssuerRiskFlags(Number(destAcct.Flags ?? 0));
        if (destFlags.requireDestTag && intent.destinationTag === undefined) {
          blockingError =
            'Destination requires a Destination Tag (lsfRequireDestTag is enabled on-ledger). Add a Destination Tag to prevent lost funds.';
        }
        if (destFlags.depositAuth) {
          warnings.push(
            'Destination has DepositAuth enabled — payment may fail with tecNO_PERMISSION unless you are preauthorized.'
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/actNotFound/i.test(msg)) {
          if (intent.asset.currency.toUpperCase() !== 'XRP') {
            blockingError =
              'Destination XRPL account is not funded yet. Issued tokens cannot be sent to an unfunded address.';
          } else if (Number(intent.asset.value) < baseReserveXrp) {
            blockingError = `Destination is unfunded and requires at least ${baseReserveXrp} XRP to activate its base reserve.`;
          } else {
            warnings.push(
              `Destination account is currently unfunded — this payment will activate it on-ledger (${baseReserveXrp} XRP base reserve).`
            );
          }
        }
      }
    }

    const txJson: Record<string, unknown> = {
      ...built.tx,
      Sequence: sequence,
      Fee: String(feeDropsNum),
      ...(lastLedgerSeq ? { LastLedgerSequence: lastLedgerSeq } : {}),
    };

    let unsignedQrSvg: string | undefined;
    let signingHex: string | undefined;
    try {
      unsignedQrSvg = await QRCode.toString(JSON.stringify(txJson), {
        type: 'svg',
        margin: 1,
        color: { dark: '#22d3ee', light: '#061022' },
      });
    } catch {
      // ignore QR overflow
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signingHex = encodeForSigning({ ...txJson, SigningPubKey: '' } as any);
    } catch {
      // optional
    }

    return {
      ok: !blockingError,
      networkId: streamStatus.networkId,
      endpoint: streamStatus.endpoint,
      txJson,
      unsignedQrSvg,
      signingHex,
      feeDrops: String(feeDropsNum),
      feeXrp: dropsToXrpString(feeDropsNum, 6),
      summaryLines: built.summaryLines,
      warnings,
      blockingError,
    };
  }

  private async broadcastAndConfirmBlob(
    stream: XrplStreamManager,
    txBlob: string,
    knownHash?: string
  ): Promise<TxSubmitResult> {
    try {
      const submitRes = await stream.request('submit', { tx_blob: txBlob });
      const resBody = (submitRes.result ?? {}) as Record<string, unknown>;
      const engineResult = String(resBody.engine_result ?? 'unknown');
      const engineMessage = String(resBody.engine_result_message ?? '');
      const txJsonResp = resBody.tx_json as Record<string, unknown> | undefined;
      const hash = knownHash || String(txJsonResp?.hash ?? '');

      const prelimAccepted =
        engineResult === 'tesSUCCESS' ||
        engineResult.startsWith('terQUEUED') ||
        engineResult === 'terPRE_SEQ';

      if (!prelimAccepted) {
        return {
          ok: false,
          hash,
          engineResult,
          engineMessage,
          error: `${engineResult}: ${engineMessage}`,
        };
      }

      if (hash) {
        for (let attempt = 0; attempt < 4; attempt++) {
          await new Promise((r) => setTimeout(r, 1300));
          try {
            const txLookup = await stream.request('tx', { transaction: hash });
            const txRes = (txLookup.result ?? {}) as Record<string, unknown>;
            if (txRes.validated) {
              const meta = txRes.meta as Record<string, unknown> | undefined;
              const finalCode = String(meta?.TransactionResult ?? engineResult);
              return {
                ok: finalCode === 'tesSUCCESS',
                hash,
                engineResult: finalCode,
                engineMessage,
                validated: true,
                ledgerIndex: typeof txRes.ledger_index === 'number' ? txRes.ledger_index : undefined,
                ...(finalCode !== 'tesSUCCESS' ? { error: `Validated with ${finalCode}` } : {}),
              };
            }
          } catch {
            // still pending
          }
        }
      }

      return {
        ok: true,
        hash,
        engineResult,
        engineMessage,
        validated: false,
      };
    } catch (err) {
      return {
        ok: false,
        hash: knownHash,
        error: err instanceof Error ? err.message : 'Transaction broadcast failed',
      };
    }
  }

  public async signAndSubmit(
    stream: XrplStreamManager,
    walletId: string,
    intent: WalletTxIntent
  ): Promise<TxSubmitResult> {
    if (this.rustSidecar) {
      try {
        this.touchAutoLock();
        const { address, publicKeyHex } = await this.rustSidecar.getPublicKey(walletId);
        if (address !== intent.account) {
          return { ok: false, error: 'Signing key address mismatch with transaction Account.' };
        }
        const preflight = await this.preflightTransaction(stream, intent);
        if (!preflight.ok || preflight.blockingError) {
          return {
            ok: false,
            error: preflight.blockingError ?? 'Pre-flight transaction safety check failed.',
          };
        }
        const txWithPub = { ...preflight.txJson, SigningPubKey: publicKeyHex };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signingHex = encodeForSigning(txWithPub as any);
        const { signatureHex } = await this.rustSidecar.signPayload(walletId, signingHex);
        const signedTx = { ...txWithPub, TxnSignature: signatureHex };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txBlob = encode(signedTx as any);
        return this.broadcastAndConfirmBlob(stream, txBlob);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Rust vault signing failed',
        };
      }
    }

    if (!this.unlockedSeeds) {
      return { ok: false, error: 'Vault is locked. Unlock your vault before signing transactions.' };
    }
    this.touchAutoLock();

    const seed = this.unlockedSeeds.get(walletId);
    if (!seed) {
      return {
        ok: false,
        error: 'Selected account is watch-only/hardware or its signing key is not in the unlocked vault.',
      };
    }

    const wallet = Wallet.fromSeed(seed);
    if (wallet.classicAddress !== intent.account) {
      return { ok: false, error: 'Signing key address mismatch with transaction Account.' };
    }

    const preflight = await this.preflightTransaction(stream, intent);
    if (!preflight.ok || preflight.blockingError) {
      return {
        ok: false,
        error: preflight.blockingError ?? 'Pre-flight transaction safety check failed.',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signed = wallet.sign(preflight.txJson as any);
    return this.broadcastAndConfirmBlob(stream, signed.tx_blob, signed.hash);
  }

  public async submitSignedBlob(stream: XrplStreamManager, txBlobInput: string): Promise<TxSubmitResult> {
    const clean = txBlobInput.trim();
    try {
      // Accepts either raw hex tx_blob OR JSON containing { tx_blob } or signed tx_json
      let blob = clean;
      if (clean.startsWith('{')) {
        const parsed = JSON.parse(clean) as Record<string, unknown>;
        if (typeof parsed.tx_blob === 'string') {
          blob = parsed.tx_blob;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          blob = encode(parsed as any);
        }
      } else {
        decode(blob); // Validate binary XRPL serialization before submitting
      }
      return this.broadcastAndConfirmBlob(stream, blob);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid signed tx_blob hex or JSON payload',
      };
    }
  }

  public async signMultisigPartial(
    walletId: string,
    txJsonInput: Record<string, unknown>
  ): Promise<{ ok: boolean; txBlob?: string; signerAddress?: string; error?: string }> {
    if (this.rustSidecar) {
      try {
        this.touchAutoLock();
        const { address, publicKeyHex } = await this.rustSidecar.getPublicKey(walletId);
        const txCopy = { ...txJsonInput, SigningPubKey: '' };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signingHex = encodeForMultiSigning(txCopy as any, address);
        const { signatureHex } = await this.rustSidecar.signPayload(walletId, signingHex);
        const partialSigned = {
          ...txCopy,
          Signers: [
            {
              Signer: {
                Account: address,
                SigningPubKey: publicKeyHex,
                TxnSignature: signatureHex,
              },
            },
          ],
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txBlob = encode(partialSigned as any);
        return { ok: true, txBlob, signerAddress: address };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Rust multi-sig signing failed',
        };
      }
    }

    if (!this.unlockedSeeds) {
      return { ok: false, error: 'Unlock your vault before producing a multi-signature.' };
    }
    this.touchAutoLock();

    const seed = this.unlockedSeeds.get(walletId);
    if (!seed) {
      return { ok: false, error: 'Selected wallet does not have a local signing seed.' };
    }

    try {
      const wallet = Wallet.fromSeed(seed);
      const txCopy = {
        ...txJsonInput,
        SigningPubKey: '',
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signed = wallet.sign(txCopy as any, true);
      return {
        ok: true,
        txBlob: signed.tx_blob,
        signerAddress: wallet.classicAddress,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Multi-sig signing failed',
      };
    }
  }

  public async combineAndSubmitMultisig(
    stream: XrplStreamManager,
    partialBlobs: string[]
  ): Promise<TxSubmitResult> {
    const cleaned = partialBlobs.map((b) => b.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return { ok: false, error: 'Provide at least one partial multi-signature blob.' };
    }
    try {
      const combinedBlob = multisign(cleaned);
      return this.broadcastAndConfirmBlob(stream, combinedBlob);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to combine multi-signed transaction blobs',
      };
    }
  }
}
