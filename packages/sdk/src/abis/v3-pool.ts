export const V3_POOL_ABI = [
    {
        type: 'function',
        name: 'liquidity',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint128',
                internalType: 'uint128',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'slot0',
        inputs: [],
        outputs: [
            {
                name: 'sqrtPriceX96',
                type: 'uint160',
                internalType: 'uint160',
            },
            {
                name: 'tick',
                type: 'int24',
                internalType: 'int24',
            },
            {
                name: 'observationIndex',
                type: 'uint16',
                internalType: 'uint16',
            },
            {
                name: 'observationCardinality',
                type: 'uint16',
                internalType: 'uint16',
            },
            {
                name: 'observationCardinalityNext',
                type: 'uint16',
                internalType: 'uint16',
            },
            {
                name: 'feeProtocol',
                type: 'uint8',
                internalType: 'uint8',
            },
            {
                name: 'unlocked',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'Collect',
        inputs: [
            {
                name: 'owner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'recipient',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
            {
                name: 'tickLower',
                type: 'int24',
                indexed: true,
                internalType: 'int24',
            },
            {
                name: 'tickUpper',
                type: 'int24',
                indexed: true,
                internalType: 'int24',
            },
            {
                name: 'amount0',
                type: 'uint128',
                indexed: false,
                internalType: 'uint128',
            },
            {
                name: 'amount1',
                type: 'uint128',
                indexed: false,
                internalType: 'uint128',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'Mint',
        inputs: [
            {
                name: 'sender',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
            {
                name: 'owner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tickLower',
                type: 'int24',
                indexed: true,
                internalType: 'int24',
            },
            {
                name: 'tickUpper',
                type: 'int24',
                indexed: true,
                internalType: 'int24',
            },
            {
                name: 'amount',
                type: 'uint128',
                indexed: false,
                internalType: 'uint128',
            },
            {
                name: 'amount0',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'amount1',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'Swap',
        inputs: [
            {
                name: 'sender',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'recipient',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'amount0',
                type: 'int256',
                indexed: false,
                internalType: 'int256',
            },
            {
                name: 'amount1',
                type: 'int256',
                indexed: false,
                internalType: 'int256',
            },
            {
                name: 'sqrtPriceX96',
                type: 'uint160',
                indexed: false,
                internalType: 'uint160',
            },
            {
                name: 'liquidity',
                type: 'uint128',
                indexed: false,
                internalType: 'uint128',
            },
            {
                name: 'tick',
                type: 'int24',
                indexed: false,
                internalType: 'int24',
            },
        ],
        anonymous: false,
    },
] as const
