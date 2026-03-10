/**
 * Sui chain adapter for Provifier.
 * Lazy-loads @mysten/sui — works without it installed (fails gracefully).
 */

class SuiAdapter {
  constructor(opts) {
    this._network = opts.network || 'testnet';
    this._privateKey = opts.privateKey || null;
    this._packageId = opts.packageId;
    this._client = null;
    this._keypair = null;
    this._Transaction = null;
    this._initialized = false;
    this._clientOnly = false;
  }

  _initClient() {
    if (this._client) return;
    try {
      const sui = require('@mysten/sui');
      const { SuiClient, getFullnodeUrl } = sui.client || sui;
      const { Transaction } = sui.transactions || sui;
      this._Transaction = Transaction;
      this._client = new SuiClient({ url: getFullnodeUrl(this._network) });
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error('Install @mysten/sui: npm install @mysten/sui');
      }
      throw err;
    }
  }

  _init() {
    if (this._initialized) return;
    this._initClient();
    if (!this._privateKey) {
      this._initialized = true;
      this._clientOnly = true;
      return;
    }
    try {
      const sui = require('@mysten/sui');
      const { Ed25519Keypair } = sui.keypairs?.ed25519 || sui;

      if (this._privateKey.startsWith('suiprivkey')) {
        this._keypair = Ed25519Keypair.fromSecretKey(this._privateKey);
      } else {
        const bytes = Uint8Array.from(Buffer.from(this._privateKey, 'hex'));
        this._keypair = Ed25519Keypair.fromSecretKey(bytes);
      }
    } catch (err) {
      throw new Error(`Failed to load Sui keypair: ${err.message}`);
    }
    this._initialized = true;
  }

  _buildCommitCall(tx, table, rowId, dataHash) {
    tx.moveCall({
      target: `${this._packageId}::protocol::commit`,
      arguments: [
        tx.pure.vector('u8', Array.from(Buffer.from(table, 'utf-8'))),
        tx.pure.vector('u8', Array.from(Buffer.from(String(rowId), 'utf-8'))),
        tx.pure.vector('u8', Array.from(Buffer.from(dataHash, 'utf-8'))),
        tx.object('0x6'),
      ],
    });
  }

  async commit(table, rowId, dataHash) {
    this._init();
    if (this._clientOnly) throw new Error('No private key — use buildCommitTx() for client-side signing');
    const tx = new this._Transaction();
    this._buildCommitCall(tx, table, rowId, dataHash);
    const result = await this._client.signAndExecuteTransaction({
      signer: this._keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
    return {
      txDigest: result.digest,
      chain: 'sui',
      network: this._network,
      events: result.events || [],
      explorerUrl: `https://suiscan.xyz/${this._network}/tx/${result.digest}`,
    };
  }

  async commitBatch(merkleRoot, leafCount) {
    this._init();
    if (this._clientOnly) throw new Error('No private key — use buildCommitTx() for client-side signing');
    const tx = new this._Transaction();
    tx.moveCall({
      target: `${this._packageId}::protocol::commit_batch`,
      arguments: [
        tx.pure.vector('u8', Array.from(Buffer.from(merkleRoot, 'utf-8'))),
        tx.pure.u64(leafCount),
        tx.object('0x6'),
      ],
    });
    const result = await this._client.signAndExecuteTransaction({
      signer: this._keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
    return {
      txDigest: result.digest,
      chain: 'sui',
      network: this._network,
      events: result.events || [],
      explorerUrl: `https://suiscan.xyz/${this._network}/tx/${result.digest}`,
    };
  }

  /** Build unsigned commit transaction for client-side wallet signing. */
  buildCommitTx(table, rowId, dataHash) {
    this._initClient();
    const tx = new this._Transaction();
    this._buildCommitCall(tx, table, rowId, dataHash);
    return tx;
  }

  /** Fetch events from a transaction for verification. */
  async getEvents(txDigest) {
    this._initClient();
    const result = await this._client.getTransactionBlock({
      digest: txDigest,
      options: { showEvents: true },
    });
    return (result.events || []).map(e => ({
      type: e.type,
      ...e.parsedJson,
    }));
  }

  getAddress() {
    this._init();
    return this._keypair ? this._keypair.toSuiAddress() : null;
  }
}

module.exports = { SuiAdapter };
