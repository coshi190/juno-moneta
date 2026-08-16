export const UNISWAP_V2_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPair',
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
        ],
        outputs: [
            {
                name: 'pair',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'PairCreated',
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
                name: 'pair',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
            {
                name: 'allPairsLength',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
] as const
