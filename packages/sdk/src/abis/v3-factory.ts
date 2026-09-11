export const V3_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPool',
        inputs: [
            {
                name: 'tokenA',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'tokenB',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'fee',
                type: 'uint24',
                internalType: 'uint24',
            },
        ],
        outputs: [
            {
                name: 'pool',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'PoolCreated',
        inputs: [
            {
                name: 'token0',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'token1',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'fee',
                type: 'uint24',
                indexed: true,
                internalType: 'uint24',
            },
            {
                name: 'tickSpacing',
                type: 'int24',
                indexed: false,
                internalType: 'int24',
            },
            {
                name: 'pool',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
] as const
