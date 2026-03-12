# Provifier

Trustless off-chain data integrity with on-chain hash commitments.

Hash your data, commit the hash to Sui, Solana, Ethereum, Polygon, or Base — verify it later. No middleman — the blockchain is the referee.

## How It Works

1. Your app hashes data using `Provifier.hashRecord(table, rowId, data)`
2. The hash is committed on-chain (Sui event, Solana memo, or EVM input data) signed by the committer's wallet
3. Anyone can later re-hash the data and compare against the on-chain commitment
4. If the hashes match, the data is authentic. If they don't, someone tampered.

No data goes on-chain — only 64-char SHA-256 hashes. Verification is trustless: re-hash locally, compare to the chain.

## Install

```bash
npm install @provifier/sdk
```

Plus one chain library (or more):

```bash
npm install @mysten/sui      # for Sui
npm install @solana/web3.js  # for Solana
npm install ethers            # for Ethereum, Polygon, Base
```

## Quick Start

```js
const { Provifier } = require('@provifier/sdk');

const p = new Provifier({
  chain: 'sui',                           // or 'solana', 'ethereum', 'polygon', 'base'
  network: 'testnet',
  privateKey: process.env.SUI_PRIVATE_KEY, // hex or suiprivkey...
  packageId: '0x...',                      // deployed Provifier Move contract
});

// Commit a record
const receipt = await p.commit({
  table: 'documents',
  rowId: 'doc-7',
  data: documentContent,
});
console.log(receipt.txDigest);    // Sui transaction digest
console.log(receipt.explorerUrl); // https://suiscan.xyz/testnet/tx/...

// Verify later
const result = await p.verify({
  table: 'documents',
  rowId: 'doc-7',
  data: documentContent,
  txDigest: receipt.txDigest,
});
console.log(result.valid); // true
```

## Batch Commits (Merkle Tree)

Commit many records in a single transaction using a Merkle tree:

```js
const batch = await p.commitBatch({
  entries: [
    { table: 'users', rowId: '1', data: JSON.stringify(user1) },
    { table: 'users', rowId: '2', data: JSON.stringify(user2) },
    { table: 'users', rowId: '3', data: JSON.stringify(user3) },
  ],
});
// batch.merkleRoot — committed on-chain
// batch.receipts — per-entry with Merkle proofs

// Verify one entry
const result = await p.verify({
  table: 'users',
  rowId: '2',
  data: JSON.stringify(user2),
  merkleProof: batch.receipts[1].merkleProof,
  merkleRoot: batch.receipts[1].merkleRoot,
  txDigest: batch.txDigest,
});
```

## Client-Side (Wallet Signing)

For dApps where the user commits from their own wallet:

```js
const p = new Provifier({
  chain: 'sui',
  network: 'mainnet',
  packageId: '0x...',
  // No privateKey — client-side mode
});

const { transaction, hash } = p.buildCommitTx({
  table: 'documents',
  rowId: 'doc-7',
  data: documentContent,
});

// Pass to user's wallet (Sui Wallet, Suiet, zkLogin, etc.)
const result = await wallet.signAndExecuteTransaction({ transaction });
```

## Solana

Uses SPL Memo program — no custom program deployment needed:

```js
const p = new Provifier({
  chain: 'solana',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  privateKey: process.env.SOLANA_KEYPAIR_SECRET, // JSON array
});

const receipt = await p.commit({ table: 'orders', rowId: 'ord-1', data: orderJson });
// receipt.explorerUrl → https://explorer.solana.com/tx/...
```

## EVM Chains (Ethereum, Polygon, Base)

Uses 0-value self-transfer with memo as tx input data — no contract deployment needed:

```js
const p = new Provifier({
  chain: 'ethereum',  // or 'polygon', 'base'
  rpcUrl: 'https://eth.llamarpc.com',
  privateKey: process.env.ETHEREUM_PRIVATE_KEY, // 0x-prefixed hex
});

const receipt = await p.commit({ table: 'invoices', rowId: 'inv-42', data: invoiceJson });
// receipt.explorerUrl → https://etherscan.io/tx/...
```

## API

### Static Methods

| Method | Returns | Description |
|---|---|---|
| `Provifier.hash(data)` | `string` | SHA-256 with `provifier:v1:` domain prefix |
| `Provifier.hashRecord(table, rowId, data)` | `string` | SHA-256 with `provifier:v1:{table}:{rowId}:` prefix |
| `Provifier.sha256(data)` | `string` | Raw SHA-256 (no domain prefix) |

### Instance Methods

| Method | Returns | Description |
|---|---|---|
| `commit({ table, rowId, data })` | `Promise<Receipt>` | Commit a single hash on-chain |
| `commitBatch({ entries })` | `Promise<BatchResult>` | Merkle batch commit |
| `verify({ table, rowId, data, txDigest, ... })` | `Promise<VerifyResult>` | Re-hash + on-chain comparison |
| `buildCommitTx({ table, rowId, data })` | `{ transaction, hash }` | Unsigned Sui tx for wallet signing |

### Constructor Options

| Option | Type | Default | Description |
|---|---|---|---|
| `chain` | `'sui' \| 'solana' \| 'ethereum' \| 'polygon' \| 'base'` | `'sui'` | Target blockchain |
| `network` | `string` | `'testnet'` | Sui: testnet/mainnet/devnet |
| `privateKey` | `string` | — | Signing key (omit for client-side) |
| `packageId` | `string` | — | Sui Move package ID |
| `rpcUrl` | `string` | — | Solana or EVM RPC URL |
| `adapter` | `object` | — | Custom chain adapter (for testing) |

## Chain Comparison

| | Sui | Solana | Ethereum | Polygon | Base |
|---|---|---|---|---|---|
| Mechanism | Move contract events | SPL Memo | Input data memo | Input data memo | Input data memo |
| Deploy needed | Once (Move pkg) | No | No | No | No |
| Cost per commit | ~$0.001 | ~$0.0005 | ~$0.50+ | ~$0.01 | ~$0.001 |
| Client-side signing | `buildCommitTx()` | No | No | No | No |
| Event querying | Structured (parsedJson) | Parse from logs | Parse from tx input | Parse from tx input | Parse from tx input |
| Explorer | suiscan.xyz | explorer.solana.com | etherscan.io | polygonscan.com | basescan.org |

## Sui Move Contract

Deploy the contract in `contracts/sui/`:

```bash
cd contracts/sui
sui move build
sui client publish --gas-budget 100000000
```

The contract emits two event types:
- `HashCommitted` — single record: committer, table, row_id, data_hash, timestamp
- `BatchCommitted` — Merkle batch: committer, merkle_root, leaf_count, timestamp

## Testing

```bash
cd packages/sdk
node --test test/sdk.test.js
```

25 tests covering hashing, Merkle trees, commit/verify round-trips, and tamper detection. Uses mock chain adapters — no network access needed.

## License

MIT
