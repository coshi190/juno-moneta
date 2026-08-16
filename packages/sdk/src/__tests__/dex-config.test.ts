import { describe, it, expect } from 'vitest'

describe('dex-config', () => {
    async function getModule() {
        return await import('../configs/dex-config')
    }

    describe('getV3Config', () => {
        it('returns V3 config for junoswap on kubTestnet', async () => {
            const { getV3Config, ProtocolType } = await getModule()
            const config = getV3Config(25925)
            expect(config).toBeDefined()
            expect(config?.protocolType).toBe(ProtocolType.V3)
            expect(config?.enabled).toBe(true)
        })

        it('returns undefined for unknown chain', async () => {
            const { getV3Config } = await getModule()
            expect(getV3Config(99999)).toBeUndefined()
        })

        it('returns undefined for DEX without V3 on chain', async () => {
            const { getV3Config } = await getModule()
            expect(getV3Config(8899, 'jibswap')).toBeUndefined()
        })
    })

    describe('getV2Config', () => {
        it('returns V2 config for jibswap on JBC', async () => {
            const { getV2Config, ProtocolType } = await getModule()
            const config = getV2Config(8899, 'jibswap')
            expect(config).toBeDefined()
            expect(config?.protocolType).toBe(ProtocolType.V2)
        })

        it('returns undefined for chain without V2', async () => {
            const { getV2Config } = await getModule()
            expect(getV2Config(25925)).toBeUndefined()
        })
    })

    describe('getDexConfig', () => {
        it('returns default protocol config', async () => {
            const { getDexConfig } = await getModule()
            const config = getDexConfig(25925)
            expect(config).toBeDefined()
        })
    })

    describe('getDexsByProtocol', () => {
        it('returns V3 DEXs on a chain sorted by priority', async () => {
            const { getDexsByProtocol, ProtocolType } = await getModule()
            const dexs = getDexsByProtocol(96, ProtocolType.V3)
            expect(dexs).toContain('junoswap')
        })

        it('returns V2 DEXs on bitkub chain', async () => {
            const { getDexsByProtocol, ProtocolType } = await getModule()
            const dexs = getDexsByProtocol(96, ProtocolType.V2)
            expect(dexs.length).toBeGreaterThan(0)
        })
    })

    describe('getSupportedDexs', () => {
        it('returns all DEXs on a chain', async () => {
            const { getSupportedDexs } = await getModule()
            const dexs = getSupportedDexs(96)
            expect(dexs).toContain('junoswap')
        })
    })

    describe('isV2Config / isV3Config', () => {
        it('type guards work correctly', async () => {
            const { isV2Config, isV3Config, getV2Config, getV3Config } = await getModule()
            const v2 = getV2Config(8899, 'jibswap')
            const v3 = getV3Config(25925)
            expect(isV2Config(v2!)).toBe(true)
            expect(isV3Config(v2!)).toBe(false)
            expect(isV3Config(v3!)).toBe(true)
            expect(isV2Config(v3!)).toBe(false)
        })
    })

    describe('getProtocolSpender', () => {
        it('returns router for V2 config', async () => {
            const { getProtocolSpender, getV2Config } = await getModule()
            const v2 = getV2Config(8899, 'jibswap')
            expect(getProtocolSpender(v2!)).toBe(v2!.router)
        })

        it('returns swapRouter for V3 config', async () => {
            const { getProtocolSpender, getV3Config } = await getModule()
            const v3 = getV3Config(25925)
            expect(getProtocolSpender(v3!)).toBe(v3!.swapRouter)
        })
    })

    describe('getDefaultDexForChain', () => {
        it('returns pancakeswap for BSC', async () => {
            const { getDefaultDexForChain } = await getModule()
            expect(getDefaultDexForChain(56)).toBe('pancakeswap')
        })

        it('returns uniswap for Base and Worldchain', async () => {
            const { getDefaultDexForChain } = await getModule()
            expect(getDefaultDexForChain(8453)).toBe('uniswap')
            expect(getDefaultDexForChain(480)).toBe('uniswap')
        })

        it('returns junoswap for other chains', async () => {
            const { getDefaultDexForChain } = await getModule()
            expect(getDefaultDexForChain(96)).toBe('junoswap')
            expect(getDefaultDexForChain(25925)).toBe('junoswap')
        })
    })
})
