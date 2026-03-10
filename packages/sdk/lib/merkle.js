/**
 * Merkle tree utilities for @provifier/sdk.
 * Proven implementation — copied from IOProof.
 */

const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Build a Merkle tree from an array of leaf hashes.
 * Returns { root, layers } where layers[0] = leaves, layers[last] = [root].
 */
function buildMerkleTree(leaves) {
  if (leaves.length === 0) return { root: null, layers: [] };
  if (leaves.length === 1) return { root: leaves[0], layers: [leaves] };

  const layers = [leaves.slice()];

  let currentLayer = leaves.slice();
  while (currentLayer.length > 1) {
    const nextLayer = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
      nextLayer.push(sha256(left + right));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return { root: currentLayer[0], layers };
}

/**
 * Get the Merkle proof (path) for a leaf at the given index.
 * Returns an array of { hash, position } where position is 'left' or 'right'.
 */
function getMerkleProof(layers, leafIndex) {
  const proof = [];
  let idx = leafIndex;

  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    if (siblingIdx < layer.length) {
      proof.push({
        hash: layer[siblingIdx],
        position: isRight ? 'left' : 'right',
      });
    } else {
      proof.push({
        hash: layer[idx],
        position: 'right',
      });
    }

    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof for a given leaf hash against a root.
 */
function verifyMerkleProof(leafHash, proof, root) {
  let hash = leafHash;
  for (const step of proof) {
    if (step.position === 'left') {
      hash = sha256(step.hash + hash);
    } else {
      hash = sha256(hash + step.hash);
    }
  }
  return hash === root;
}

module.exports = { buildMerkleTree, getMerkleProof, verifyMerkleProof };
