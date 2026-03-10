const { hashRecord } = require('./hash');
const { verifyMerkleProof } = require('./merkle');

/**
 * Verify a single commit against on-chain event data.
 */
async function verifySingle({ table, rowId, data, dataHash, txDigest, chainAdapter }) {
  const computedHash = dataHash || hashRecord(table, rowId, data);
  const result = { valid: false, computedHash, onChainHash: null, chainVerified: false };

  if (chainAdapter && txDigest) {
    const events = await chainAdapter.getEvents(txDigest);
    const ev = events.find(e => e.type && e.type.includes('HashCommitted'));
    if (ev) {
      const onChain = ev.data_hash || null;
      result.onChainHash = onChain;
      result.chainVerified = computedHash === onChain;
      result.valid = result.chainVerified;
    }
  }

  return result;
}

/**
 * Verify a batch entry: re-hash, walk Merkle proof, compare root to on-chain.
 */
async function verifyBatch({ table, rowId, data, dataHash, merkleProof, merkleRoot, txDigest, chainAdapter }) {
  const computedHash = dataHash || hashRecord(table, rowId, data);
  const result = { valid: false, computedHash, merkleValid: false, onChainRoot: null, chainVerified: false };

  if (merkleProof && merkleRoot) {
    result.merkleValid = verifyMerkleProof(computedHash, merkleProof, merkleRoot);
  }

  if (chainAdapter && txDigest) {
    const events = await chainAdapter.getEvents(txDigest);
    const ev = events.find(e => e.type && e.type.includes('BatchCommitted'));
    if (ev) {
      const onChain = ev.merkle_root || null;
      result.onChainRoot = onChain;
      const rootMatch = merkleRoot === onChain;
      result.chainVerified = result.merkleValid && rootMatch;
    }
  }

  result.valid = result.merkleValid && (result.chainVerified || !chainAdapter);
  return result;
}

module.exports = { verifySingle, verifyBatch };
