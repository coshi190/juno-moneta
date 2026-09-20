import type { LaunchpadAdapter } from './types.js'

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

    async swap({ event }) {
        const { sender, isBuy, tokenAddr, amountIn, amountOut, reserveIn, reserveOut } = event.args
        return {
            tokenAddr,
            sender,
            isBuy: Boolean(isBuy),
            amountIn: BigInt(amountIn),
            amountOut: BigInt(amountOut),
            reserveIn: BigInt(reserveIn),
            reserveOut: BigInt(reserveOut),
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
