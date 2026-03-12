const express = require('express');
const config = require('../config');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { deductCredit } = require('../auth/alexiuz-credits');
const { insertCommit } = require('../db');
const { Provifier } = require('../../packages/sdk');

const router = express.Router();

// Cache Provifier instances per chain
const instances = {};

function getProvifier(chain) {
  const c = chain || config.chain;
  if (instances[c]) return instances[c];

  const opts = { chain: c };
  if (c === 'sui') {
    opts.network = config.sui.network;
    opts.privateKey = config.sui.privateKey;
    opts.packageId = config.sui.packageId;
  } else if (c === 'solana' || c === 'sol') {
    opts.rpcUrl = config.solana.rpcUrl;
    opts.privateKey = config.solana.keypairSecret;
  } else if (['ethereum', 'polygon', 'base'].includes(c)) {
    if (!config[c].rpcUrl || !config[c].privateKey) {
      throw new Error(`${c} is not available on the hosted API. Use the SDK to self-host.`);
    }
    opts.rpcUrl = config[c].rpcUrl;
    opts.privateKey = config[c].privateKey;
  }

  instances[c] = new Provifier(opts);
  return instances[c];
}

// POST /v1/commit — single hash commit (1 credit)
router.post('/commit', apiKeyAuth, async (req, res) => {
  try {
    const { table, rowId, data, dataHash, chain } = req.body;

    if (!table || typeof table !== 'string') {
      return res.status(400).json({ error: { message: 'Missing or invalid "table" field.', code: 'INVALID_INPUT' } });
    }
    if (rowId === undefined || rowId === null) {
      return res.status(400).json({ error: { message: 'Missing "rowId" field.', code: 'INVALID_INPUT' } });
    }
    if (!data && !dataHash) {
      return res.status(400).json({ error: { message: 'Provide "data" or "dataHash".', code: 'INVALID_INPUT' } });
    }

    const p = getProvifier(chain);
    const receipt = await p.commit({ table, rowId: String(rowId), data, dataHash });

    const commit = insertCommit({
      userId: req.pvfUser?.id || null,
      type: 'single',
      table,
      rowId: String(rowId),
      dataHash: receipt.hash,
      merkleRoot: null,
      leafCount: null,
      txDigest: receipt.txDigest,
      chain: receipt.chain || chain || config.chain,
      network: receipt.network || config.sui.network,
      explorerUrl: receipt.explorerUrl,
    });

    // Deduct 1 credit (async, non-blocking)
    if (req.pvfUser?.alexiuzUserId) {
      deductCredit(req.pvfUser.alexiuzUserId, 1, `Commit: ${receipt.hash.substring(0, 16)}...`, commit.id).catch(() => {});
    }

    res.json({
      hash: receipt.hash,
      table,
      rowId: String(rowId),
      txDigest: receipt.txDigest,
      chain: receipt.chain || chain || config.chain,
      network: receipt.network || config.sui.network,
      explorerUrl: receipt.explorerUrl,
      commitId: commit.id,
    });
  } catch (err) {
    console.error('[COMMIT] Error:', err.message);
    res.status(500).json({ error: { message: 'Commit failed.', code: 'COMMIT_FAILED', details: err.message } });
  }
});

// POST /v1/commit-batch — Merkle batch commit (1 credit)
router.post('/commit-batch', apiKeyAuth, async (req, res) => {
  try {
    const { entries, chain } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: { message: 'Provide non-empty "entries" array.', code: 'INVALID_INPUT' } });
    }
    if (entries.length > 1000) {
      return res.status(400).json({ error: { message: 'Max 1000 entries per batch.', code: 'BATCH_TOO_LARGE' } });
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.table || typeof e.table !== 'string') {
        return res.status(400).json({ error: { message: `Entry ${i}: missing "table".`, code: 'INVALID_INPUT' } });
      }
      if (e.rowId === undefined || e.rowId === null) {
        return res.status(400).json({ error: { message: `Entry ${i}: missing "rowId".`, code: 'INVALID_INPUT' } });
      }
      if (!e.data && !e.dataHash) {
        return res.status(400).json({ error: { message: `Entry ${i}: provide "data" or "dataHash".`, code: 'INVALID_INPUT' } });
      }
    }

    const p = getProvifier(chain);
    const result = await p.commitBatch({ entries });

    const commit = insertCommit({
      userId: req.pvfUser?.id || null,
      type: 'batch',
      table: entries[0].table,
      rowId: null,
      dataHash: null,
      merkleRoot: result.merkleRoot,
      leafCount: result.leafCount,
      txDigest: result.txDigest,
      chain: result.chain || chain || config.chain,
      network: result.network || config.sui.network,
      explorerUrl: result.explorerUrl,
    });

    if (req.pvfUser?.alexiuzUserId) {
      deductCredit(req.pvfUser.alexiuzUserId, 1, `Batch: ${result.leafCount} entries`, commit.id).catch(() => {});
    }

    res.json({
      merkleRoot: result.merkleRoot,
      leafCount: result.leafCount,
      txDigest: result.txDigest,
      chain: result.chain || chain || config.chain,
      network: result.network || config.sui.network,
      explorerUrl: result.explorerUrl,
      commitId: commit.id,
      receipts: result.receipts,
    });
  } catch (err) {
    console.error('[COMMIT-BATCH] Error:', err.message);
    res.status(500).json({ error: { message: 'Batch commit failed.', code: 'COMMIT_FAILED', details: err.message } });
  }
});

module.exports = router;
