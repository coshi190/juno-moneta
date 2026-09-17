import { decodeFunctionData } from 'viem'
import schema from 'ponder:schema'
import { DURIANFUN_FACTORY_ABI } from '../abis/durianfun.js'
import { DURIANFUN_VIRTUAL_RESERVE } from './registry.js'
import type { LaunchpadAdapter, NormalizedSwap } from './types.js'

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n

const WAD = 10n ** 18n

const CREATOR_FEE_PIPS = 67n
const PIPS_DENOMINATOR = 100_000n

function derivedTokenReserve(
    kubReserve: bigint,
    priceAfter: bigint,
    virtualReserve: bigint
): bigint {
    if (priceAfter <= 0n) return TOTAL_SUPPLY
    return ((kubReserve + virtualReserve) * WAD) / priceAfter
}

const MIN_PRICE_MOVE_PPM = 1_000_000n

function solveVirtualReserve(
    prevKub: bigint,
    prevPrice: bigint,
    kub: bigint,
    price: bigint,
    tokenDelta: bigint
): bigint | null {
    const denominator = prevPrice - price
    const move = denominator < 0n ? -denominator : denominator
    if (move * MIN_PRICE_MOVE_PPM < prevPrice) return null

    const numerator = (tokenDelta * prevPrice * price) / WAD + prevKub * price - kub * prevPrice
    const virtualReserve = numerator / denominator
    return virtualReserve > 0n ? virtualReserve : null
}

export const durianfunAdapter: LaunchpadAdapter = {
    launchpadId: 'durianfun',

    bindings: {
        creation: { contract: 'curve', event: 'TokenCreated' },
        swaps: [
            { contract: 'market', event: 'TokensBought', isBuy: true },
            { contract: 'market', event: 'TokensSold', isBuy: false },
        ],
        graduation: { contract: 'market', event: 'Graduated' },
    },

    async creation({ event }) {
        const { token, market, creator, name, symbol, timestamp, graduationTarget } = event.args

        let logo = ''
        try {
            const { args } = decodeFunctionData({
                abi: DURIANFUN_FACTORY_ABI,
                data: event.transaction.input,
            })
            if (args) logo = (args[2] as string) ?? ''
        } catch {
            logo = ''
        }

        return {
            tokenAddr: token,
            creator,
            market,
            name: name ?? '',
            symbol: symbol ?? '',
            logo,
            description: '',
            link1: '',
            link2: '',
            link3: '',
            createdTime: Number(timestamp ?? 0),
            graduationTarget: graduationTarget === undefined ? undefined : Number(graduationTarget),
        }
    },

    async swap({ event, context }, isBuy) {
        const market = event.log.address.toLowerCase()
        const registered = await context.db.find(schema.launchMarket, { market })
        if (!registered) {
            throw new Error(`Durianfun swap on unregistered market ${market}`)
        }

        const { kubReserve, priceAfter, feeKub } = event.args
        const reserveNative = BigInt(kubReserve)
        const price = BigInt(priceAfter)

        const buy = isBuy === true
        const amountIn = BigInt(buy ? event.args.kubIn : event.args.tokenIn)
        const amountOut = BigInt(buy ? event.args.tokensOut : event.args.kubOut)

        let solved = registered.virtualReserve ? BigInt(registered.virtualReserve) : null

        if (solved === null) {
            solved =
                registered.lastKubReserve && registered.lastPriceAfter
                    ? solveVirtualReserve(
                          BigInt(registered.lastKubReserve),
                          BigInt(registered.lastPriceAfter),
                          reserveNative,
                          price,
                          buy ? -amountOut : amountIn
                      )
                    : null
            await context.db.update(schema.launchMarket, { market }).set({
                virtualReserve: solved?.toString() ?? null,
                lastKubReserve: reserveNative.toString(),
                lastPriceAfter: price.toString(),
            })
        }

        const virtualReserve = solved ?? DURIANFUN_VIRTUAL_RESERVE
        const reserveToken = derivedTokenReserve(reserveNative, price, virtualReserve)
        const grossNative = buy ? amountIn : amountOut + BigInt(feeKub)

        const swap: NormalizedSwap = {
            tokenAddr: registered.tokenAddr,
            sender: buy ? event.args.buyer : event.args.seller,
            isBuy: buy,
            amountIn,
            amountOut,
            reserveIn: buy ? reserveNative : reserveToken,
            reserveOut: buy ? reserveToken : reserveNative,
            creatorFeeNative: (grossNative * CREATOR_FEE_PIPS) / PIPS_DENOMINATOR,
            virtualReserve,
        }
        return swap
    },

    async graduation({ event }) {
        return {
            tokenAddr: event.args.token,
            ammPool: event.args.ammPool,
        }
    },
}
