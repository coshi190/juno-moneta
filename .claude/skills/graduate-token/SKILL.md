---
name: graduate-token
description: Force a stuck bonding-curve token to graduate on Bitkub mainnet, fixing the V3 pool price first if needed.
---

# Graduating a stuck token

> **This signs and broadcasts real transactions on Bitkub mainnet (chain 96) and
> moves real funds.** There is no script and no `--execute` flag any more — you
> compose the calls. That makes the discipline below mandatory, not optional:
>
> 1. Do the **read-only pass first**: every `readContract` below, printed as a
>    plan, with no wallet client constructed.
> 2. Show the operator the plan and the numbers.
> 3. Broadcast only after they explicitly say to. Never infer consent from "fix
>    it" or "go ahead with the skill".
>
> If any assertion in the preconditions or the post-swap guard fails, stop. Do
> not work around it.

## When to use this

Recovery only. A token has reached `graduationAmount` on the bonding curve, but
its Uniswap V3 pool already exists at a price that does not match the curve's
graduation price, so `graduate()` reverts. This moves the pool price onto the
target, then graduates.

## Pick the path first

Two curves exist, and the recovery differs:

| Curve | Path |
| ----- | ---- |
| **V1** at `0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e` — live on mainnet | [Manual path](#manual-path-v1) |
| **V1.1** — has `creatorOf`, no `setFeeCollector` | [Helper path](#helper-path-v11) |

Ask the operator which curve the token is on, or read the address they give you.
`GraduationHelper` is bound to V1.1 and **must not** be pointed at V1: V1 gates
graduation on `token * graduationAmount <= native * INITIALTOKEN` where the
helper requires `native >= graduationAmount`, and V1 omits the `tokenLiquidity`
balance clamp V1.1 applies, so the two compute different target prices from the
same reserves.

## Inputs

| Value          | Default                        | Notes                                                      |
| -------------- | ------------------------------ | ---------------------------------------------------------- |
| token address  | none                           | Always ask; there is no sensible default                   |
| `RPC_URL`      | `https://rpc.bitkubchain.io`   |                                                            |
| `PRIVATE_KEY`  | falls back to `contracts/.env` | Match `/^PRIVATE_KEY\s*=\s*(?:0x)?([0-9a-fA-F]{64})\s*$/m` |
| `SEED_KKUB`    | `0.01` KKUB                    | KKUB side of the temporary seed position                   |
| `SEED_TOKEN`   | `1000` tokens                  | Token side of the temporary seed position                  |
| `TOLERANCE_BP` | `25`                           | How close to target counts as "already correct"            |

Gas reserve: keep `0.05` KUB unwrapped when deciding how much to wrap.

**You must already hold the launch token.** Both paths need it, and there is no
way to acquire it on-chain once a token is stuck: `buy()` is dead at the cap and
the griefed pool has no liquidity to buy from. It has to come from an existing
holder. Sort that out before starting.

## Addresses (Bitkub mainnet, chain 96)

```
BONDING_CURVE     0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e   # V1, live
V3_FACTORY        0x090C6E5fF29251B1eF9EC31605Bdd13351eA316C
V3_POS_MANAGER    0xb6b76870549893c6b59E7e979F254d0F9Cca4Cc9
V3_SWAP_ROUTER    0x3F7582E36843FF79F173c7DC19f517832496f2D8

BONDING_CURVE_V1_1  <not deployed yet>
GRADUATION_HELPER   <not deployed yet>
```

The helper path cannot be run until both placeholders are filled in. When they
are, read `helper.curve()` and `helper.wrappedNative()` back and check them
against the curve before the first use — both are `immutable`, so a helper wired
to the wrong curve has to be redeployed rather than corrected.

`wrappedNative` (KKUB) is read from the bonding curve, not hardcoded. Fee tier is
`10000`; full range is ticks `-887200` … `887200`.

Use `viem` with ABIs imported from `packages/sdk/src/index.js`:
`BONDING_CURVE_JUNOSWAP_ABI`, `UNISWAP_V3_FACTORY_ABI`, `UNISWAP_V3_POOL_ABI`,
`NONFUNGIBLE_POSITION_MANAGER_ABI`, `UNISWAP_V3_SWAP_ROUTER_ABI`, `WETH9_ABI`,
`ERC20_ABI`. If contracts changed, run the `codegen` skill first. The published
`BONDING_CURVE_JUNOSWAP_ABI` is V1's — it still carries `setFeeCollector`, which
V1.1 removed — so the helper path needs a regenerated ABI too.

---

# Helper path (V1.1)

`GraduationHelper.rescue()` does the seed, the swap, the price guard, the
graduation, and the unwind in one transaction. That atomicity is the point: run
as separate transactions, the repair leaves a tiny seeded position that anyone
can shove back off band before `graduate()` lands, and `graduate()` is
permissionless so you cannot hold the slot.

## 1. Read-only pass

```
target  = GRADUATION_HELPER.targetSqrtPriceX96(token)
pool    = V3_FACTORY.getPool(token0, token1, 10000)
current = pool == 0x0 ? 0 : V3_POOL.slot0()[0]
gapBp   = current == 0 ? 0 : GRADUATION_HELPER.deviationBps(current, target)
```

`targetSqrtPriceX96` mirrors the curve's own encoder, so there is no arithmetic
to do here — no bigint reserve maths, no integer square root.

Also read `BONDING_CURVE_V1_1.isGraduate(token)` and
`pumpReserve(token)` → `[reserveNative, reserveToken]` so you have numbers to
show:

```
assert isGraduate === false                     // else: already graduated
assert reserveNative >= graduationAmount        // cap met
```

Report `target`, `current`, `gapBp`, and whether a repair is needed
(`gapBp > TOLERANCE_BP`). A pool at `0x0`, an uninitialised pool, and a pool
already inside tolerance all need no repair — `rescue()` handles each internally,
so you still make the same single call either way.

**This is the end of the read-only pass — stop here and get confirmation.**

## 2. Fund and approve

The helper never touches native. KKUB gates `withdraw()` to KYC-registered
addresses, so a contract cannot unwrap; you wrap going in and unwrap coming out,
on your own account. Leftovers come back as KKUB, not KUB.

- assert token balance ≥ what you intend to pass as `tokenAmount`
- `deposit()` on `wrappedNative` for the KKUB you intend to pass as
  `wrappedAmount`, after asserting `kubBalance - 0.05 KUB ≥ that amount`
- `approve` `GRADUATION_HELPER` for the launch token and for KKUB (max uint256,
  skipping if the existing allowance already covers it)

Size `tokenAmount` and `wrappedAmount` generously — whatever the repair does not
consume is returned in the same transaction. The seed alone needs `SEED_TOKEN`
(1000 tokens) and `SEED_WRAPPED` (0.01 KKUB); the swap needs enough of whichever
side moves the price toward the target, which you will not know exactly in
advance.

## 3. Rescue

```
GRADUATION_HELPER.rescue(token, tokenAmount, wrappedAmount, TOLERANCE_BP)
```

The tolerance is enforced on-chain. If the repair cannot reach the target the
call reverts with `repair missed target`, nothing graduates, and your assets stay
yours — so there is no separate post-swap guard to remember, and no way to
graduate at a wrong price by pressing on.

Other reverts worth recognising: `not reach graduation cap` (the cap assertion
above), `token already graduated`, `not enough token to seed` /
`not enough wrapped to seed` (raise the amounts), `no input to repair with` (you
passed only the seed amounts and nothing to swap with).

## 4. After

- re-read `isGraduate(token)` and assert it is now true
- `withdraw(balance)` your remaining KKUB back to KUB
- print closing KUB / KKUB / token balances

There is no position to unwind and no `tokenId` to track — the helper mints its
seed, removes it, and burns it inside the call.

---

# Manual path (V1)

For the live V1 curve, which the helper cannot serve. Seed, swap, and graduate
are three separate transactions; between the swap and the graduation the
repaired price is exposed, so move promptly and re-check before graduating.

## 1. Read state and assert preconditions

From `BONDING_CURVE`: `wrappedNative()`, `virtualAmount()`, `graduationAmount()`,
`INITIALTOKEN()`, `pumpReserve(token)` → `[reserveNative, reserveToken]`, and
`isGraduate(token)`.

```
assert isGraduate === false                  // else: already graduated, nothing to do
assert reserveToken * graduationAmount <= reserveNative * INITIALTOKEN   // cap met
```

Both are hard stops.

## 2. Compute the target price

```
tokenIsToken0 = token.toLowerCase() < wrappedNative.toLowerCase()
[token0, token1] = tokenIsToken0 ? [token, wrappedNative] : [wrappedNative, token]

tokenLiquidity = reserveToken * reserveNative / (virtualAmount + reserveNative)
[a0, a1] = tokenIsToken0 ? [tokenLiquidity, reserveNative] : [reserveNative, tokenLiquidity]

targetSqrtPriceX96 = floor(sqrt((a1 * 2**192) / a0))
assert targetSqrtPriceX96 <= 2**160 - 1
```

All bigint integer arithmetic — no floats anywhere. Use Newton's method for the
integer square root; `Math.sqrt` loses precision at this magnitude.

## 3. Read the pool

`V3_FACTORY.getPool(token0, token1, 10000)`. If non-zero, read `slot0()[0]`
(current `sqrtPriceX96`) and `liquidity()`.

Deviation is measured in basis points as `|a - b| * 10000 / b` against the
target — on `sqrtPriceX96`, so a bp here is half a bp of price. V1 `graduate()`
mints at 95% minimums, which admits ~±500 bp of price, i.e. ~±250 bp of
`sqrtPriceX96`; `TOLERANCE_BP = 25` keeps the repair comfortably inside that
band. (V1.1 tightened those minimums to 99%, ~±100 bp of price — the same
tolerance is conservative under either, but do not carry V1.1's numbers into a
V1 recovery.)

**Three cases call `graduate(token)` directly with no price fix:**

- pool address is `0x0` — `graduate()` creates and initialises it itself
- pool exists but `slot0().sqrtPriceX96 == 0` — uninitialised, same
- deviation ≤ `TOLERANCE_BP` — already correct

Otherwise a fix is needed:

```
zeroForOne = targetSqrtPriceX96 < currentSqrtPriceX96
tokenIn  = zeroForOne ? token0 : token1
tokenOut = zeroForOne ? token1 : token0
needSeed = poolLiquidity == 0
```

Report direction, `tokenIn`, whether a seed is required, and the gap in bp.
**This is the end of the read-only pass — stop here and get confirmation.**

## 4. Seed the pool (only when `needSeed`)

A swap cannot move a pool with zero liquidity, so mint a throwaway position.

- assert token balance ≥ `SEED_TOKEN`
- if KKUB balance < `SEED_KKUB`: `deposit()` on `wrappedNative` for the shortfall,
  after asserting `kubBalance - 0.05 KUB ≥ shortfall`
- approve `V3_POS_MANAGER` for both token and KKUB (`approve` to max uint256,
  skipping if the existing allowance already covers it)
- `V3_POS_MANAGER.mint({ token0, token1, fee: 10000, tickLower: -887200,
tickUpper: 887200, amount0Desired, amount1Desired, amount0Min: 0,
amount1Min: 0, recipient: sender, deadline: now + 1200 })`

`amount*Desired` follows token ordering: whichever of `token0`/`token1` is the
launch token gets `SEED_TOKEN`, the other gets `SEED_KKUB`. Keep the returned
`tokenId` — step 6 unwinds it.

## 5. Swap to the target price

Approve `V3_SWAP_ROUTER` for `tokenIn`, then:

```
V3_SWAP_ROUTER.exactInputSingle({
  tokenIn, tokenOut, fee: 10000, recipient: sender,
  amountIn: <full tokenIn balance>,
  amountOutMinimum: 0,
  sqrtPriceLimitX96: targetSqrtPriceX96,
})
```

The price limit is what makes this safe: the swap stops at the target rather
than consuming the whole balance. `amountOutMinimum: 0` is correct **only**
because of that limit.

**Post-swap guard — do not skip.** Re-read `slot0()[0]`. If it is more than
`TOLERANCE_BP` from target, abort _before_ `graduate()`. Landing short means the
pool lacked the depth to reach the target and graduating anyway locks in a wrong
price.

## 6. Graduate, then unwind

- `BONDING_CURVE.graduate(token)`, then re-read `isGraduate(token)` and assert it
  is now true.
- If a seed position was minted: read `positions(tokenId)`, and if liquidity > 0
  call `decreaseLiquidity({ tokenId, liquidity, amount0Min: 0, amount1Min: 0 })`,
  then `collect({ tokenId, recipient: sender, amount0Max: MAX_UINT128,
amount1Max: MAX_UINT128 })`, then `burn(tokenId)`.
- Unwrap any remaining KKUB via `withdraw(balance)`.
- Print closing KUB / KKUB / token balances.

`amount0Max`/`amount1Max` are `uint128` in the ABI, so the cap is `2**128 - 1`.
The old script at `scripts/graduate-token.ts` in git history passed `2**256 - 1`
here, which viem rejects at encode time — that unwind path was never exercised.
Use the `uint128` max.

---

## Sending transactions

For every write: `simulateContract` first, `estimateContractGas`, send with a
150% gas buffer, `waitForTransactionReceipt`, and throw if
`receipt.status !== 'success'`. The simulate step is what catches a revert
before it costs gas — always do it, even mid-sequence.
