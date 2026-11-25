import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { serializeRowsToCsv } from '../src/shared/studioUtils';
import type {
  LedgerSnapshot,
  LiveTransaction,
  SqliteAnalyticsSummary,
} from '../src/shared/types';

let sqlEnginePromise: Promise<SqlJsStatic> | null = null;

function getSqlEngine(): Promise<SqlJsStatic> {
  if (!sqlEnginePromise) {
    const resolvedWasm = require.resolve('sql.js/dist/sql-wasm.wasm');
    // Support unpacked ASAR path when packaged by electron-builder
    const unpackedPath = resolvedWasm.replace('app.asar', 'app.asar.unpacked');
    const finalWasmPath = fsSync.existsSync(unpackedPath) ? unpackedPath : resolvedWasm;
    const rawBuf = fsSync.readFileSync(finalWasmPath);
    const wasmBinary = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
    sqlEnginePromise = initSqlJs({ wasmBinary });
  }
  return sqlEnginePromise;
}

export class AnalyticsSqliteService {
  private db: Database | null = null;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly storageDir: string) {}

  public get dbFilePath(): string {
    return path.join(this.storageDir, 'command-center.sqlite');
  }

  public async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await fs.mkdir(this.storageDir, { recursive: true });
      const SQL = await getSqlEngine();

      try {
        const existing = await fs.readFile(this.dbFilePath);
        this.db = new SQL.Database(new Uint8Array(existing));
      } catch {
        this.db = new SQL.Database();
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS ledger_metrics (
          ledger_index INTEGER PRIMARY KEY,
          network TEXT NOT NULL,
          ledger_time INTEGER NOT NULL,
          txn_count INTEGER NOT NULL,
          fee_base_drops INTEGER NOT NULL,
          close_duration_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet_tx_journal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          network TEXT NOT NULL,
          tx_type TEXT NOT NULL,
          account TEXT NOT NULL,
          destination TEXT NOT NULL,
          amount_display TEXT NOT NULL,
          fee_drops INTEGER NOT NULL,
          hash TEXT NOT NULL,
          status TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_journal_ts ON wallet_tx_journal(timestamp DESC);
      `);

      this.flushTimer = setInterval(() => {
        if (this.dirty) {
          void this.flushToDisk();
        }
      }, 8_000);
      if (typeof this.flushTimer.unref === 'function') {
        this.flushTimer.unref();
      }
    })();

    return this.initPromise;
  }

  public async flushToDisk(): Promise<void> {
    if (!this.db) return;
    this.dirty = false;
    const bytes = this.db.export();
    const tmp = `${this.dbFilePath}.tmp`;
    await fs.writeFile(tmp, Buffer.from(bytes));
    await fs.rename(tmp, this.dbFilePath);
  }

  public async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.db) {
      await this.flushToDisk().catch(() => undefined);
      this.db.close();
      this.db = null;
    }
  }

  public async recordLedger(network: string, ledger: LedgerSnapshot): Promise<void> {
    await this.init();
    if (!this.db || !ledger.ledgerIndex) return;

    this.db.run(
      `INSERT OR REPLACE INTO ledger_metrics
       (ledger_index, network, ledger_time, txn_count, fee_base_drops, close_duration_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ledger.ledgerIndex,
        network,
        ledger.ledgerTime,
        ledger.txnCount,
        ledger.feeBaseDrops,
        ledger.closeDurationMs ?? 3500,
      ]
    );

    // Keep table bounded to most recent 5,000 ledgers
    this.db.run(
      `DELETE FROM ledger_metrics WHERE ledger_index NOT IN (
        SELECT ledger_index FROM ledger_metrics ORDER BY ledger_index DESC LIMIT 5000
      )`
    );
    this.dirty = true;
  }

  public async recordJournalEntry(entry: {
    network: string;
    txType: string;
    account: string;
    destination?: string;
    amountDisplay: string;
    feeDrops: number;
    hash: string;
    status: string;
  }): Promise<void> {
    await this.init();
    if (!this.db) return;

    this.db.run(
      `INSERT INTO wallet_tx_journal
       (timestamp, network, tx_type, account, destination, amount_display, fee_drops, hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Date.now(),
        entry.network,
        entry.txType,
        entry.account,
        entry.destination ?? '',
        entry.amountDisplay,
        entry.feeDrops,
        entry.hash,
        entry.status,
      ]
    );
    await this.flushToDisk();
  }

  public async recordMatchedStreamTx(network: string, tx: LiveTransaction): Promise<void> {
    if (!tx.validated) return;
    await this.recordJournalEntry({
      network,
      txType: tx.txType,
      account: tx.account,
      destination: tx.destination,
      amountDisplay: tx.amountDisplay,
      feeDrops: tx.feeDrops,
      hash: tx.hash,
      status: tx.engineResult ?? 'tesSUCCESS',
    });
  }

  public async getSummary(): Promise<SqliteAnalyticsSummary> {
    await this.init();
    let dbSizeBytes = 0;
    try {
      const st = await fs.stat(this.dbFilePath);
      dbSizeBytes = st.size;
    } catch {
      dbSizeBytes = this.db ? this.db.export().byteLength : 0;
    }

    if (!this.db) {
      return {
        dbPath: this.dbFilePath,
        dbSizeBytes,
        recordedLedgers: 0,
        recordedTxJournal: 0,
        avgTpsRecent: 0,
        avgFeeDropsRecent: 10,
        peakTxnLedger: null,
        recentJournal: [],
        ledgerSeries: [],
      };
    }

    const ledgerAgg = this.db.exec(
      `SELECT COUNT(*), AVG(txn_count * 1000.0 / MAX(close_duration_ms, 1000)), AVG(fee_base_drops)
       FROM (SELECT * FROM ledger_metrics ORDER BY ledger_index DESC LIMIT 120)`
    );
    const totalLedgersRes = this.db.exec(`SELECT COUNT(*) FROM ledger_metrics`);
    const totalJournalRes = this.db.exec(`SELECT COUNT(*) FROM wallet_tx_journal`);
    const peakRes = this.db.exec(
      `SELECT ledger_index, txn_count FROM ledger_metrics ORDER BY txn_count DESC LIMIT 1`
    );
    const journalRows = this.db.exec(
      `SELECT id, timestamp, network, tx_type, account, destination, amount_display, fee_drops, hash, status
       FROM wallet_tx_journal ORDER BY timestamp DESC LIMIT 80`
    );
    const seriesRows = this.db.exec(
      `SELECT ledger_index, ledger_time, txn_count, fee_base_drops, close_duration_ms
       FROM ledger_metrics ORDER BY ledger_index DESC LIMIT 60`
    );

    const recordedLedgers = Number(totalLedgersRes[0]?.values[0]?.[0] ?? 0);
    const recordedTxJournal = Number(totalJournalRes[0]?.values[0]?.[0] ?? 0);
    const avgTpsRecent = Number(Number(ledgerAgg[0]?.values[0]?.[1] ?? 0).toFixed(2));
    const avgFeeDropsRecent = Math.round(Number(ledgerAgg[0]?.values[0]?.[2] ?? 10));

    const peakVal = peakRes[0]?.values[0];
    const peakTxnLedger = peakVal
      ? { ledgerIndex: Number(peakVal[0]), txnCount: Number(peakVal[1]) }
      : null;

    const recentJournal = (journalRows[0]?.values ?? []).map((r) => ({
      id: Number(r[0]),
      timestamp: Number(r[1]),
      network: String(r[2]),
      txType: String(r[3]),
      account: String(r[4]),
      destination: String(r[5]),
      amountDisplay: String(r[6]),
      feeDrops: Number(r[7]),
      hash: String(r[8]),
      status: String(r[9]),
    }));

    const ledgerSeries = (seriesRows[0]?.values ?? [])
      .map((r) => ({
        ledgerIndex: Number(r[0]),
        ledgerTime: Number(r[1]),
        txnCount: Number(r[2]),
        feeBaseDrops: Number(r[3]),
        closeDurationMs: Number(r[4]),
      }))
      .reverse();

    return {
      dbPath: this.dbFilePath,
      dbSizeBytes,
      recordedLedgers,
      recordedTxJournal,
      avgTpsRecent,
      avgFeeDropsRecent,
      peakTxnLedger,
      recentJournal,
      ledgerSeries,
    };
  }

  public async buildCsvExport(kind: 'transactions' | 'ledgers'): Promise<{
    csv: string;
    rowCount: number;
  }> {
    await this.init();
    if (!this.db) return { csv: '', rowCount: 0 };

    if (kind === 'transactions') {
      const res = this.db.exec(
        `SELECT timestamp, network, tx_type, account, destination, amount_display, fee_drops, status, hash
         FROM wallet_tx_journal ORDER BY timestamp DESC`
      );
      const rows = (res[0]?.values ?? []).map((r) => [
        new Date(Number(r[0])).toISOString(),
        String(r[1]),
        String(r[2]),
        String(r[3]),
        String(r[4]),
        String(r[5]),
        Number(r[6]),
        String(r[7]),
        String(r[8]),
      ]);
      return {
        csv: serializeRowsToCsv(
          ['ISO_Timestamp', 'Network', 'TxType', 'Account', 'Destination', 'Amount', 'FeeDrops', 'Status', 'Hash'],
          rows
        ),
        rowCount: rows.length,
      };
    }

    const res = this.db.exec(
      `SELECT ledger_index, network, ledger_time, txn_count, fee_base_drops, close_duration_ms
       FROM ledger_metrics ORDER BY ledger_index DESC`
    );
    const rows = (res[0]?.values ?? []).map((r) => [
      Number(r[0]),
      String(r[1]),
      new Date(Number(r[2])).toISOString(),
      Number(r[3]),
      Number(r[4]),
      Number(r[5]),
    ]);
    return {
      csv: serializeRowsToCsv(
        ['LedgerIndex', 'Network', 'CloseTimeISO', 'TxnCount', 'BaseFeeDrops', 'CloseDurationMs'],
        rows
      ),
      rowCount: rows.length,
    };
  }
}
