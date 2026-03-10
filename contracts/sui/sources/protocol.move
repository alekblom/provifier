/// Provifier: trustless off-chain data integrity protocol.
/// Emits events for hash commitments — no stored objects, cheapest possible.
module provifier::protocol {
    use sui::clock::Clock;
    use sui::event;

    /// Emitted when a single record hash is committed.
    public struct HashCommitted has copy, drop {
        committer: address,
        table_name: vector<u8>,
        row_id: vector<u8>,
        data_hash: vector<u8>,
        timestamp_ms: u64,
    }

    /// Emitted when a Merkle batch root is committed.
    public struct BatchCommitted has copy, drop {
        committer: address,
        merkle_root: vector<u8>,
        leaf_count: u64,
        timestamp_ms: u64,
    }

    /// Commit a single record hash on-chain.
    public fun commit(
        table_name: vector<u8>,
        row_id: vector<u8>,
        data_hash: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        event::emit(HashCommitted {
            committer: ctx.sender(),
            table_name,
            row_id,
            data_hash,
            timestamp_ms: clock.timestamp_ms(),
        });
    }

    /// Commit a Merkle tree root covering a batch of records.
    public fun commit_batch(
        merkle_root: vector<u8>,
        leaf_count: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        event::emit(BatchCommitted {
            committer: ctx.sender(),
            merkle_root,
            leaf_count,
            timestamp_ms: clock.timestamp_ms(),
        });
    }
}
