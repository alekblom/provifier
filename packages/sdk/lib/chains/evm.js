/**
 * EVM chain adapter for Provifier.
 * Uses 0-value self-transfer with memo as tx input data — no contract deployment needed.
 * Works on Ethereum, Polygon, Base, and any EVM-compatible chain.
 * Lazy-loads ethers v6.
 */

const EXPLORER_URLS = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  base: 'https://basescan.org/tx/',
};

class EvmAdapter {
  constructor(opts) {
    this._rpcUrl = opts.rpcUrl || null;
    this._privateKey = opts.privateKey || null;
    this._chainName = opts.chainName || 'ethereum';
    this._ethers = null;
    this._provider = null;
    this._wallet = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    try {
      this._ethers = require('ethers');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error('Install ethers: npm install ethers');
      }
      throw err;
    }
    if (!this._rpcUrl) throw new Error(`No RPC URL configured for ${this._chainName}`);
    this._provider = new this._ethers.JsonRpcProvider(this._rpcUrl);
    if (this._privateKey) {
      this._wallet = new this._ethers.Wallet(this._privateKey, this._provider);
    }
    this._initialized = true;
  }

  _detectNetwork() {
    // Derive network label from rpcUrl heuristics
    const url = (this._rpcUrl || '').toLowerCase();
    if (url.includes('sepolia')) return 'sepolia';
    if (url.includes('goerli')) return 'goerli';
    if (url.includes('testnet')) return 'testnet';
    if (url.includes('devnet')) return 'devnet';
    if (url.includes('mumbai')) return 'mumbai';
    return 'mainnet';
  }

  _explorerUrl(txHash) {
    const base = EXPLORER_URLS[this._chainName] || EXPLORER_URLS.ethereum;
    return `${base}${txHash}`;
  }

  async commit(table, rowId, dataHash) {
    this._init();
    if (!this._wallet) throw new Error('No private key configured');
    const memo = `provifier|commit|${table}|${rowId}|${dataHash}|${new Date().toISOString()}`;
    const data = this._ethers.hexlify(this._ethers.toUtf8Bytes(memo));

    const tx = await this._wallet.sendTransaction({
      to: this._wallet.address,
      value: 0,
      data,
    });
    const receipt = await tx.wait();
    const txHash = receipt.hash;

    return {
      txDigest: txHash,
      chain: this._chainName,
      network: this._detectNetwork(),
      explorerUrl: this._explorerUrl(txHash),
    };
  }

  async commitBatch(merkleRoot, leafCount) {
    this._init();
    if (!this._wallet) throw new Error('No private key configured');
    const memo = `provifier|batch|${merkleRoot}|${leafCount}|${new Date().toISOString()}`;
    const data = this._ethers.hexlify(this._ethers.toUtf8Bytes(memo));

    const tx = await this._wallet.sendTransaction({
      to: this._wallet.address,
      value: 0,
      data,
    });
    const receipt = await tx.wait();
    const txHash = receipt.hash;

    return {
      txDigest: txHash,
      chain: this._chainName,
      network: this._detectNetwork(),
      explorerUrl: this._explorerUrl(txHash),
    };
  }

  async getEvents(txHash) {
    this._init();
    const tx = await this._provider.getTransaction(txHash);
    if (!tx || !tx.data || tx.data === '0x') return [];

    let memo;
    try {
      memo = this._ethers.toUtf8String(tx.data);
    } catch {
      return [];
    }

    if (!memo.startsWith('provifier|')) return [];

    const events = [];
    const parts = memo.split('|');
    if (parts[1] === 'commit') {
      events.push({
        type: 'HashCommitted',
        table_name: parts[2],
        row_id: parts[3],
        data_hash: parts[4],
        timestamp: parts[5],
      });
    } else if (parts[1] === 'batch') {
      events.push({
        type: 'BatchCommitted',
        merkle_root: parts[2],
        leaf_count: parseInt(parts[3]),
        timestamp: parts[4],
      });
    }
    return events;
  }

  getAddress() {
    this._init();
    return this._wallet ? this._wallet.address : null;
  }
}

module.exports = { EvmAdapter };
