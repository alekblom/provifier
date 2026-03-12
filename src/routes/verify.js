const express = require('express');
const config = require('../config');
const { findCommitByTxDigest } = require('../db');
const { Provifier } = require('../../packages/sdk');

const router = express.Router();

// GET /v1/verify/:txDigest — free, no auth
router.get('/verify/:txDigest', async (req, res) => {
  try {
    const { txDigest } = req.params;
    const { table, rowId, data, dataHash } = req.query;

    // If no data provided, just look up stored commit
    if (!data && !dataHash) {
      const commit = findCommitByTxDigest(txDigest);
      if (!commit) {
        return res.status(404).json({ error: { message: 'Commit not found.', code: 'NOT_FOUND' } });
      }
      return res.json({
        found: true,
        commitId: commit.id,
        type: commit.type,
        table: commit.table,
        dataHash: commit.dataHash,
        merkleRoot: commit.merkleRoot,
        leafCount: commit.leafCount,
        txDigest: commit.txDigest,
        chain: commit.chain,
        network: commit.network,
        explorerUrl: commit.explorerUrl,
        createdAt: commit.createdAt,
      });
    }

    // Data provided — verify against chain
    if (!table || !rowId) {
      return res.status(400).json({
        error: { message: 'Provide "table" and "rowId" query params to verify.', code: 'INVALID_INPUT' },
      });
    }

    const chain = req.query.chain || config.chain;
    const opts = { chain };
    if (chain === 'sui') {
      opts.network = config.sui.network;
      opts.packageId = config.sui.packageId;
    } else if (['ethereum', 'polygon', 'base'].includes(chain)) {
      opts.rpcUrl = config[chain].rpcUrl;
    } else {
      opts.rpcUrl = config.solana.rpcUrl;
    }

    const p = new Provifier(opts);
    const result = await p.verify({
      table, rowId, data, dataHash, txDigest,
      merkleProof: req.query.merkleProof ? JSON.parse(req.query.merkleProof) : undefined,
      merkleRoot: req.query.merkleRoot || undefined,
    });

    res.json({
      valid: result.valid,
      computedHash: result.computedHash,
      onChainHash: result.onChainHash || result.onChainRoot || null,
      chainVerified: result.chainVerified,
      merkleValid: result.merkleValid || null,
      txDigest,
    });
  } catch (err) {
    console.error('[VERIFY] Error:', err.message);
    res.status(500).json({ error: { message: 'Verification failed.', code: 'VERIFY_FAILED', details: err.message } });
  }
});

module.exports = router;
