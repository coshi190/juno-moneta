export const V2_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPair',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
        ],
        outputs: [{ name: 'pair', type: 'address' }],
    },
    {
        type: 'event',
        name: 'PairCreated',
        anonymous: false,
        inputs: [
            { name: 'token0', type: 'address', indexed: true },
            { name: 'token1', type: 'address', indexed: true },
            { name: 'pair', type: 'address', indexed: false },
            { name: 'allPairsLength', type: 'uint256', indexed: false },
        ],
    },
] as const
