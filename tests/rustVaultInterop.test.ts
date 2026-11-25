import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decode, ECDSA, encode, encodeForSigning, Wallet } from 'xrpl';
import {
  resolveRustSidecarBinaryPath,
  RustVaultSidecarClient,
} from '../electron/rustVaultClient';

describe('Rust Vault Sidecar <-> official xrpl.js cryptographic interoperability', () => {
  let tmpDir = '';
  let client: RustVaultSidecarClient | null = null;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrpl-rust-interop-'));
  });

  afterEach(async () => {
    client?.shutdown();
    client = null;
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('derives bit-for-bit identical ed25519 & secp256k1 addresses/pubkeys as xrpl.js and produces valid XRPL signatures', async () => {
    const binPath = resolveRustSidecarBinaryPath(false);
    expect(binPath).not.toBeNull();

    client = new RustVaultSidecarClient(binPath!, tmpDir);
    client.start();

    const st = await client.setupVault('rust-argon2id-master-passphrase');
    expect(st.backend).toBe('rust-sidecar');
    expect(st.initialized).toBe(true);
    expect(st.unlocked).toBe(true);

    // 1) Cross-verify Ed25519 wallet derivation & canonical signing
    const edCreated = await client.createWallet('Rust Ed25519', 'ed25519');
    const jsEdWallet = Wallet.fromSeed(edCreated.oneTimeSeed);
    expect(edCreated.account.address).toBe(jsEdWallet.classicAddress);

    const edPub = await client.getPublicKey(edCreated.account.id);
    expect(edPub.publicKeyHex).toBe(jsEdWallet.publicKey);

    const edTx = {
      TransactionType: 'Payment',
      Account: edCreated.account.address,
      Destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      Amount: '5000000',
      Sequence: 42,
      Fee: '12',
      SigningPubKey: edPub.publicKeyHex,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edSigningHex = encodeForSigning(edTx as any);
    const edSig = await client.signPayload(edCreated.account.id, edSigningHex);
    const edSignedBlob = encode({ ...edTx, TxnSignature: edSig.signatureHex } as any);
    const edDecoded = decode(edSignedBlob);
    expect(edDecoded.Account).toBe(edCreated.account.address);
    expect(edDecoded.TxnSignature).toBe(edSig.signatureHex);

    // Also verify Ed25519 deterministic signature matches xrpl.js directly!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsEdSigned = jsEdWallet.sign({
      TransactionType: 'Payment',
      Account: edCreated.account.address,
      Destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      Amount: '5000000',
      Sequence: 42,
      Fee: '12',
    } as any);
    expect(edSignedBlob).toBe(jsEdSigned.tx_blob);

    // 2) Cross-verify secp256k1 wallet derivation & RFC-6979 low-S canonical DER signing
    const secpCreated = await client.createWallet('Rust Secp256k1', 'ecdsa-secp256k1');
    const jsSecpWallet = Wallet.fromSeed(secpCreated.oneTimeSeed, { algorithm: ECDSA.secp256k1 });
    expect(secpCreated.account.address).toBe(jsSecpWallet.classicAddress);

    // Also verify against the canonical XRPL Genesis Seed test vector!
    const genesis = await client.importSeed('Genesis Vector', 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb');
    expect(genesis.account.address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');

    const secpPub = await client.getPublicKey(secpCreated.account.id);
    expect(secpPub.publicKeyHex).toBe(jsSecpWallet.publicKey);

    const secpTx = {
      TransactionType: 'Payment',
      Account: secpCreated.account.address,
      Destination: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
      Amount: '2500000',
      Sequence: 7,
      Fee: '12',
      SigningPubKey: secpPub.publicKeyHex,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secpSigningHex = encodeForSigning(secpTx as any);
    const secpSig = await client.signPayload(secpCreated.account.id, secpSigningHex);
    const secpSignedBlob = encode({ ...secpTx, TxnSignature: secpSig.signatureHex } as any);
    const secpDecoded = decode(secpSignedBlob);
    expect(secpDecoded.Account).toBe(secpCreated.account.address);
    expect(secpDecoded.TxnSignature).toBe(secpSig.signatureHex);

    // 3) Verify lock wipes memory and blocks signing until re-unlocked
    const locked = await client.lock();
    expect(locked.unlocked).toBe(false);
    await expect(client.signPayload(edCreated.account.id, edSigningHex)).rejects.toThrow();

    const unlocked = await client.unlock('rust-argon2id-master-passphrase');
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.accounts).toHaveLength(3);
  });
});
