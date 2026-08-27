import { describe, it, expect } from 'vitest'
import { addLiquidity, subLiquidity } from '../src/v3-position-math'

// liquidity is uint128 in a text column, so the math must stay on BigInt; the clamp guards the indexer's replayed total, which no contract invariant constrains.
describe('addLiquidity', () => {
    it('handles values beyond Number precision', () => {
        const big = 10n ** 30n
        expect(addLiquidity(big.toString(), big)).toBe((big * 2n).toString())
    })
})

describe('subLiquidity', () => {
    it('subtracts a decrease delta', () => {
        expect(subLiquidity('1250', 250n)).toBe('1000')
    })

    it('clamps at zero rather than going negative (full burn / over-decrease)', () => {
        expect(subLiquidity('1000', 1000n)).toBe('0')
        expect(subLiquidity('1000', 5000n)).toBe('0')
    })
})
