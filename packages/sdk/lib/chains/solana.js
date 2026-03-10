/**
 * Solana chain adapter for Provifier.
 * Uses SPL Memo program — no custom program deployment needed.
 * Lazy-loads @solana/web3.js.
 */

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

class SolanaAdapter {
  constructor(opts) {
    this._rpcUrl = opts.rpcUrl || 'https://api.devnet.solana.com';
    this._privateKey = opts.privateKey || null;
    this._connection = null;
    this._keypair = null;
    this._sol = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    try {
      this._sol = require('@solana/web3.js');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error('Install @solana/web3.js: npm install @solana/web3.js');
      }
      throw err;
    }
    this._connection = new this._sol.Connection(this._rpcUrl, 'confirmed');
    if (this._privateKey) {
      const secret = typeof this._privateKey === 'string'
        ? Uint8Array.from(JSON.parse(this._privateKey))
        : this._privateKey;
      this._keypair = this._sol.Keypair.fromSecretKey(secret);
    }
    this._initialized = true;
  }

  _buildMemo(content) {
    this._init();
    return new this._sol.TransactionInstruction({
      keys: [{ pubkey: this._keypair.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from(content, 'utf-8'),
      programId: new this._sol.PublicKey(MEMO_PROGRAM_ID),
    });
  }

  async commit(table, rowId, dataHash) {
    this._init();
    if (!this._keypair) throw new Error('No private key configured');
    const memo = `provifier|commit|${table}|${rowId}|${dataHash}|${new Date().toISOString()}`;
    const tx = new this._sol.Transaction().add(this._buildMemo(memo));
    const signature = await this._sol.sendAndConfirmTransaction(this._connection, tx, [this._keypair]);
    const network = this._rpcUrl.includes('devnet') ? 'devnet' : this._rpcUrl.includes('testnet') ? 'testnet' : 'mainnet-beta';
    return {
      txSignature: signature,
      txDigest: signature,
      chain: 'solana',
      network,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${network}`,
    };
  }

  async commitBatch(merkleRoot, leafCount) {
    this._init();
    if (!this._keypair) throw new Error('No private key configured');
    const memo = `provifier|batch|${merkleRoot}|${leafCount}|${new Date().toISOString()}`;
    const tx = new this._sol.Transaction().add(this._buildMemo(memo));
    const signature = await this._sol.sendAndConfirmTransaction(this._connection, tx, [this._keypair]);
    const network = this._rpcUrl.includes('devnet') ? 'devnet' : this._rpcUrl.includes('testnet') ? 'testnet' : 'mainnet-beta';
    return {
      txSignature: signature,
      txDigest: signature,
      chain: 'solana',
      network,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${network}`,
    };
  }

  async getEvents(txSignature) {
    this._init();
    const tx = await this._connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) return [];
    const events = [];
    for (const log of tx.meta.logMessages) {
      const match = log.match(/Program log: (provifier\|.+)/);
      if (!match) continue;
      const parts = match[1].split('|');
      if (parts[1] === 'commit') {
        events.push({ type: 'HashCommitted', table_name: parts[2], row_id: parts[3], data_hash: parts[4], timestamp: parts[5] });
      } else if (parts[1] === 'batch') {
        events.push({ type: 'BatchCommitted', merkle_root: parts[2], leaf_count: parseInt(parts[3]), timestamp: parts[4] });
      }
    }
    return events;
  }

  getAddress() {
    this._init();
    return this._keypair ? this._keypair.publicKey.toBase58() : null;
  }
}

module.exports = { SolanaAdapter };
