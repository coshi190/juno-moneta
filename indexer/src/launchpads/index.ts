import { getChains } from '../config.js'
import { getLaunchpads } from './registry.js'
import { junoswapV1Adapter, junoswapV1_1Adapter } from './juno-v1.js'
import { durianfunAdapter } from './durianfun.js'
import type { ContractRole, LaunchpadAdapter } from './types.js'

const ADAPTERS: Record<string, LaunchpadAdapter> = {
    [junoswapV1Adapter.launchpadId]: junoswapV1Adapter,
    [junoswapV1_1Adapter.launchpadId]: junoswapV1_1Adapter,
    [durianfunAdapter.launchpadId]: durianfunAdapter,
}

export function getAdapter(launchpadId: string): LaunchpadAdapter {
    const adapter = ADAPTERS[launchpadId]
    if (!adapter) throw new Error(`No launchpad adapter registered for "${launchpadId}"`)
    return adapter
}

export const CONTRACT_NAMES = {
    'junoswap:kubTestnet': {
        curve: 'CurveJunoswapKubTestnet',
        token: 'LaunchTokenJunoswapKubTestnet',
    },
    'junoswap:bitkub': {
        curve: 'CurveJunoswapBitkub',
        token: 'LaunchTokenJunoswapBitkub',
    },
    'junoswap-v1_1:kubTestnet': {
        curve: 'CurveJunoswapV11KubTestnet',
        token: 'LaunchTokenJunoswapV11KubTestnet',
    },
    'durianfun:bitkub': {
        curve: 'CurveDurianfunBitkub',
        market: 'MarketDurianfunBitkub',
        token: 'LaunchTokenDurianfunBitkub',
    },
} as const

type ContractKey = keyof typeof CONTRACT_NAMES

export function contractNames(launchpadId: string, chainSlug: string) {
    const names = CONTRACT_NAMES[`${launchpadId}:${chainSlug}` as ContractKey]
    if (!names) {
        throw new Error(
            `No ponder contract names for launchpad "${launchpadId}" on chain "${chainSlug}" — ` +
                `add them to CONTRACT_NAMES and to ponder.config.ts`
        )
    }
    return names
}

export function contractNameFor(
    names: ReturnType<typeof contractNames>,
    role: ContractRole
): string {
    const name = role === 'market' && 'market' in names ? names.market : names.curve
    if (role === 'market' && !('market' in names)) {
        throw new Error(`No "market" contract registered for ${names.curve}`)
    }
    return name
}

export function enabledLaunchpads() {
    return Object.entries(getChains()).flatMap(([chainSlug, chainId]) =>
        getLaunchpads(chainId).map((launchpad) => ({ chainSlug, launchpad }))
    )
}
