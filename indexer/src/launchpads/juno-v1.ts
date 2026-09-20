import { JUNO_CURVE_VIEWS_ABI } from '../abis/juno-curve.js'
import type { LaunchpadAdapter } from './types.js'

const BPS_DENOMINATOR = 10000n

async function grossAmountIn(context: any, curve: string, amountIn: bigint): Promise<bigint> {
    const pumpFee = (await context.client.readContract({
        abi: JUNO_CURVE_VIEWS_ABI,
        functionName: 'pumpFee',
        address: curve as `0x${string}`,
    })) as bigint
    if (pumpFee <= 0n || pumpFee >= BPS_DENOMINATOR) return amountIn
    return (amountIn * BPS_DENOMINATOR) / (BPS_DENOMINATOR - pumpFee)
}

export const junoswapV1Adapter: LaunchpadAdapter = {
    launchpadId: 'junoswap',

    bindings: {
        creation: { contract: 'curve', event: 'Creation' },
        swaps: [{ contract: 'curve', event: 'Swap' }],
        graduation: { contract: 'curve', event: 'Graduation' },
    },

    async creation({ event }) {
        const { creator, tokenAddr, logo, description, link1, link2, link3, createdTime } =
            event.args
        return {
            tokenAddr,
            creator,
            logo: logo ?? '',
            description: description ?? '',
            link1: link1 ?? '',
            link2: link2 ?? '',
            link3: link3 ?? '',
            createdTime: Number(createdTime ?? 0),
        }
    },

    async swap({ event, context }) {
        const { sender, isBuy, tokenAddr, amountIn, amountOut, reserveIn, reserveOut } = event.args
        const inAmount = BigInt(amountIn)
        return {
            tokenAddr,
            sender,
            isBuy: Boolean(isBuy),
            amountIn: inAmount,
            amountOut: BigInt(amountOut),
            reserveIn: BigInt(reserveIn),
            reserveOut: BigInt(reserveOut),
            grossAmountIn: await grossAmountIn(context, event.log.address, inAmount),
        }
    },

    async graduation({ event }) {
        return { tokenAddr: event.args.tokenAddr }
    },
}

export const junoswapV1_1Adapter: LaunchpadAdapter = {
    ...junoswapV1Adapter,
    launchpadId: 'junoswap-v1_1',
}
