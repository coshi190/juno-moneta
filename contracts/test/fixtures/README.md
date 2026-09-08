# Fork-test RPC cache

`rpc-cache-96-35019116.json` is the forge RPC state cache for Bitkub mainnet (chain 96) at block
35,019,116, the block `JunoBondingCurveV1_1.fork.t.sol` pins as `FORK_BLOCK`.

The public node `https://rpc.bitkubchain.io` keeps only ~128 blocks of state (~6.4 minutes at
3 s/block), and there is no public archive endpoint for this chain. Without this cache the pinned
block cannot be forked and `setUp` fails with `missing trie node`.

Install it before running the fork suite:

    mkdir -p ~/.foundry/cache/rpc/96
    cp contracts/test/fixtures/rpc-cache-96-35019116.json ~/.foundry/cache/rpc/96/35019116

It holds 15 accounts and 50 storage slots — the V3 factory, position manager, swap router and KKUB.
That is the entire mainnet surface the suite reads; every token, curve and pool the tests use is
created by the tests and lives in local state.

To re-pin at a newer block, fork inside the live window, then copy the resulting cache entry here:

    h=$(cast block-number --rpc-url https://rpc.bitkubchain.io)
    FORK_TESTS=true KUB_MAINNET_RPC=https://rpc.bitkubchain.io KUB_FORK_BLOCK=$((h-5)) \
      forge test --match-path test/JunoBondingCurveV1_1.fork.t.sol
