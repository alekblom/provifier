const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Provifier, hash, hashRecord, sha256, buildMerkleTree, getMerkleProof, verifyMerkleProof } = require('../index');

// --- Mock chain adapter for testing without real chain access ---

function createMockAdapter() {
  const committed = [];
  return {
    committed,
    async commit(table, rowId, dataHash) {
      const entry = { type: 'commit', table, rowId, dataHash, txDigest: `mock_tx_${committed.length}` };
      committed.push(entry);
      return { txDigest: entry.txDigest, chain: 'mock', network: 'test', explorerUrl: '' };
    },
    async commitBatch(merkleRoot, leafCount) {
      const entry = { type: 'batch', merkleRoot, leafCount, txDigest: `mock_batch_${committed.length}` };
      committed.push(entry);
      return { txDigest: entry.txDigest, chain: 'mock', network: 'test', explorerUrl: '' };
    },
    async getEvents(txDigest) {
      const entry = committed.find(c => c.txDigest === txDigest);
      if (!entry) return [];
      if (entry.type === 'commit') {
        return [{ type: 'HashCommitted', data_hash: entry.dataHash }];
      }
      if (entry.type === 'batch') {
        return [{ type: 'BatchCommitted', merkle_root: entry.merkleRoot, leaf_count: entry.leafCount }];
      }
      return [];
    },
    buildCommitTx(table, rowId, dataHash) {
      return { mock: true, table, rowId, dataHash };
    },
  };
}

// --- Hash tests ---

describe('hash', () => {
  it('produces 64-char hex string', () => {
    const h = hash('hello');
    assert.equal(h.length, 64);
    assert.match(h, /^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    assert.equal(hash('test data'), hash('test data'));
  });

  it('different input produces different hash', () => {
    assert.notEqual(hash('input A'), hash('input B'));
  });

  it('differs from raw SHA-256 (domain separation)', () => {
    assert.notEqual(hash('hello'), sha256('hello'));
  });
});

describe('hashRecord', () => {
  it('produces 64-char hex string', () => {
    const h = hashRecord('users', '1', { name: 'Alice' });
    assert.equal(h.length, 64);
  });

  it('is deterministic', () => {
    assert.equal(
      hashRecord('users', '1', { name: 'Alice' }),
      hashRecord('users', '1', { name: 'Alice' }),
    );
  });

  it('different table produces different hash', () => {
    assert.notEqual(
      hashRecord('users', '1', 'data'),
      hashRecord('orders', '1', 'data'),
    );
  });

  it('different rowId produces different hash', () => {
    assert.notEqual(
      hashRecord('users', '1', 'data'),
      hashRecord('users', '2', 'data'),
    );
  });

  it('handles Buffer data', () => {
    const h = hashRecord('files', '1', Buffer.from('binary data'));
    assert.equal(h.length, 64);
  });
});

// --- Merkle tree tests ---

describe('merkle', () => {
  it('empty tree returns null root', () => {
    const { root } = buildMerkleTree([]);
    assert.equal(root, null);
  });

  it('single leaf returns leaf as root', () => {
    const { root } = buildMerkleTree(['abc123']);
    assert.equal(root, 'abc123');
  });

  it('two leaves produce valid root', () => {
    const h1 = sha256('leaf1');
    const h2 = sha256('leaf2');
    const { root, layers } = buildMerkleTree([h1, h2]);
    assert.equal(root.length, 64);
    assert.equal(layers.length, 2);
  });

  it('odd number of leaves works', () => {
    const leaves = [sha256('a'), sha256('b'), sha256('c')];
    const { root } = buildMerkleTree(leaves);
    assert.ok(root);
  });

  it('proof verifies for each leaf', () => {
    const leaves = [sha256('a'), sha256('b'), sha256('c'), sha256('d')];
    const { root, layers } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(layers, i);
      assert.ok(verifyMerkleProof(leaves[i], proof, root), `Proof failed for leaf ${i}`);
    }
  });

  it('rejects tampered leaf', () => {
    const leaves = [sha256('a'), sha256('b'), sha256('c'), sha256('d')];
    const { root, layers } = buildMerkleTree(leaves);
    const proof = getMerkleProof(layers, 0);
    assert.equal(verifyMerkleProof(sha256('TAMPERED'), proof, root), false);
  });
});

// --- Provifier class tests ---

describe('Provifier', () => {
  it('static hash works without instance', () => {
    const h = Provifier.hash('test');
    assert.equal(h.length, 64);
  });

  it('static hashRecord works without instance', () => {
    const h = Provifier.hashRecord('t', '1', 'data');
    assert.equal(h.length, 64);
  });

  it('commit sends hash to adapter and returns receipt', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const receipt = await p.commit({ table: 'users', rowId: '42', data: 'Alice' });

    assert.equal(receipt.table, 'users');
    assert.equal(receipt.rowId, '42');
    assert.equal(receipt.hash.length, 64);
    assert.ok(receipt.txDigest.startsWith('mock_tx_'));
    assert.equal(adapter.committed.length, 1);
    assert.equal(adapter.committed[0].dataHash, receipt.hash);
  });

  it('commit uses provided dataHash', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const receipt = await p.commit({ table: 'x', rowId: '1', dataHash: 'custom_hash_abc' });

    assert.equal(receipt.hash, 'custom_hash_abc');
    assert.equal(adapter.committed[0].dataHash, 'custom_hash_abc');
  });

  it('commitBatch builds Merkle tree and commits root', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const result = await p.commitBatch({
      entries: [
        { table: 'docs', rowId: '1', data: 'doc one' },
        { table: 'docs', rowId: '2', data: 'doc two' },
        { table: 'docs', rowId: '3', data: 'doc three' },
      ],
    });

    assert.equal(result.leafCount, 3);
    assert.equal(result.merkleRoot.length, 64);
    assert.equal(result.receipts.length, 3);
    assert.equal(adapter.committed.length, 1);
    assert.equal(adapter.committed[0].type, 'batch');
    assert.equal(adapter.committed[0].merkleRoot, result.merkleRoot);

    // Each receipt has a Merkle proof
    for (const r of result.receipts) {
      assert.ok(r.merkleProof);
      assert.ok(Array.isArray(r.merkleProof));
      assert.equal(r.merkleRoot, result.merkleRoot);
    }
  });

  it('verify single commit returns valid', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const receipt = await p.commit({ table: 'users', rowId: '1', data: 'Bob' });

    const result = await p.verify({
      table: 'users', rowId: '1', data: 'Bob',
      txDigest: receipt.txDigest,
    });
    assert.equal(result.valid, true);
    assert.equal(result.chainVerified, true);
    assert.equal(result.computedHash, receipt.hash);
  });

  it('verify detects tampered data', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const receipt = await p.commit({ table: 'users', rowId: '1', data: 'Bob' });

    const result = await p.verify({
      table: 'users', rowId: '1', data: 'TAMPERED',
      txDigest: receipt.txDigest,
    });
    assert.equal(result.valid, false);
    assert.equal(result.chainVerified, false);
  });

  it('verify batch entry via Merkle proof', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const batch = await p.commitBatch({
      entries: [
        { table: 'docs', rowId: '1', data: 'first' },
        { table: 'docs', rowId: '2', data: 'second' },
      ],
    });

    // Verify second entry
    const r = batch.receipts[1];
    const result = await p.verify({
      table: 'docs', rowId: '2', data: 'second',
      merkleProof: r.merkleProof,
      merkleRoot: r.merkleRoot,
      txDigest: batch.txDigest,
    });
    assert.equal(result.valid, true);
    assert.equal(result.merkleValid, true);
    assert.equal(result.chainVerified, true);
  });

  it('verify batch rejects tampered entry', async () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const batch = await p.commitBatch({
      entries: [
        { table: 'docs', rowId: '1', data: 'first' },
        { table: 'docs', rowId: '2', data: 'second' },
      ],
    });

    const r = batch.receipts[0];
    const result = await p.verify({
      table: 'docs', rowId: '1', data: 'CHANGED',
      merkleProof: r.merkleProof,
      merkleRoot: r.merkleRoot,
      txDigest: batch.txDigest,
    });
    assert.equal(result.valid, false);
    assert.equal(result.merkleValid, false);
  });

  it('buildCommitTx returns unsigned transaction + hash', () => {
    const adapter = createMockAdapter();
    const p = new Provifier({ adapter });
    const { transaction, hash } = p.buildCommitTx({ table: 'files', rowId: 'f1', data: 'content' });

    assert.ok(transaction);
    assert.equal(hash.length, 64);
    assert.equal(transaction.mock, true);
    assert.equal(transaction.dataHash, hash);
  });
});
