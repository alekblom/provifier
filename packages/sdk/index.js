/**
 * @provifier/sdk — Trustless off-chain data integrity with on-chain hash commitments.
 * Multi-chain: Sui (Move contract events) + Solana (SPL Memo) + EVM (input data memo).
 */

const { sha256, hash, hashRecord } = require('./lib/hash');
const { buildMerkleTree, getMerkleProof, verifyMerkleProof } = require('./lib/merkle');
const { verifySingle, verifyBatch } = require('./lib/verify');

class Provifier {
  /**
   * @param {object} opts
   * @param {'sui'|'solana'|'ethereum'|'polygon'|'base'} [opts.chain='sui']
   * @param {string} [opts.network='testnet']
   * @param {string} [opts.privateKey] - Hex, bech32 (Sui), JSON array (Solana), or 0x-prefixed (EVM). Omit for client-side.
   * @param {string} [opts.packageId] - Sui Move package ID (required for Sui).
   * @param {string} [opts.rpcUrl] - Solana or EVM RPC URL.
   * @param {object} [opts.adapter] - Custom chain adapter (for testing).
   */
  constructor(opts = {}) {
    this._chain = opts.chain || 'sui';

    if (opts.adapter) {
      this._adapter = opts.adapter;
    } else if (this._chain === 'solana' || this._chain === 'sol') {
      const { SolanaAdapter } = require('./lib/chains/solana');
      this._adapter = new SolanaAdapter({
        rpcUrl: opts.rpcUrl,
        privateKey: opts.privateKey,
      });
    } else if (['ethereum', 'polygon', 'base', 'evm'].includes(this._chain)) {
      const { EvmAdapter } = require('./lib/chains/evm');
      this._adapter = new EvmAdapter({
        rpcUrl: opts.rpcUrl,
        privateKey: opts.privateKey,
        chainName: this._chain === 'evm' ? 'ethereum' : this._chain,
      });
    } else {
      const { SuiAdapter } = require('./lib/chains/sui');
      this._adapter = new SuiAdapter({
        network: opts.network || 'testnet',
        privateKey: opts.privateKey,
        packageId: opts.packageId,
      });
    }
  }

  // --- Static hashing (no instance needed) ---

  static hash(data) { return hash(data); }
  static hashRecord(table, rowId, data) { return hashRecord(table, rowId, data); }
  static sha256(data) { return sha256(data); }

  // --- Single commit ---

  async commit({ table, rowId, data, dataHash }) {
    const computedHash = dataHash || hashRecord(table, rowId, data);
    const result = await this._adapter.commit(table, String(rowId), computedHash);
    return { hash: computedHash, table, rowId: String(rowId), ...result };
  }

  // --- Batch commit (Merkle tree) ---

  async commitBatch({ entries }) {
    const hashes = entries.map(e => e.dataHash || hashRecord(e.table, e.rowId, e.data));
    const { root, layers } = buildMerkleTree(hashes);
    if (!root) throw new Error('No entries to batch');

    const chainResult = await this._adapter.commitBatch(root, hashes.length);

    const receipts = entries.map((entry, i) => ({
      table: entry.table,
      rowId: String(entry.rowId),
      hash: hashes[i],
      merkleProof: getMerkleProof(layers, i),
      merkleRoot: root,
    }));

    return { merkleRoot: root, leafCount: hashes.length, receipts, ...chainResult };
  }

  // --- Verification ---

  async verify({ table, rowId, data, dataHash, txDigest, merkleProof, merkleRoot }) {
    if (merkleProof && merkleRoot) {
      return verifyBatch({ table, rowId, data, dataHash, merkleProof, merkleRoot, txDigest, chainAdapter: this._adapter });
    }
    return verifySingle({ table, rowId, data, dataHash, txDigest, chainAdapter: this._adapter });
  }

  // --- Client-side: build unsigned tx for wallet signing (Sui only) ---

  buildCommitTx({ table, rowId, data, dataHash }) {
    if (!this._adapter.buildCommitTx) {
      throw new Error('buildCommitTx is only supported for Sui chain');
    }
    const computedHash = dataHash || hashRecord(table, rowId, data);
    return { transaction: this._adapter.buildCommitTx(table, String(rowId), computedHash), hash: computedHash };
  }
}

module.exports = {
  Provifier,
  hash, hashRecord, sha256,
  buildMerkleTree, getMerkleProof, verifyMerkleProof,
};
