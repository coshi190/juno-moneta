export const DURIANFUN_FACTORY_ABI = [
    {
        type: 'event',
        name: 'TokenCreated',
        inputs: [
            { name: 'token', type: 'address', indexed: true },
            { name: 'market', type: 'address', indexed: true },
            { name: 'creator', type: 'address', indexed: true },
            { name: 'name', type: 'string', indexed: false },
            { name: 'symbol', type: 'string', indexed: false },
            { name: 'totalSupply', type: 'uint256', indexed: false },
            { name: 'timestamp', type: 'uint256', indexed: false },
            { name: 'graduationTarget', type: 'uint8', indexed: false },
        ],
    },

    {
        type: 'function',
        name: 'createToken',
        stateMutability: 'payable',
        inputs: [
            { name: 'tokenName', type: 'string' },
            { name: 'tokenSymbol', type: 'string' },
            { name: 'imageUrl', type: 'string' },
            { name: 'referrer', type: 'address' },
            { name: 'graduationTarget', type: 'uint8' },
        ],
        outputs: [{ type: 'address' }, { type: 'address' }],
    },
] as const

export const DURIANFUN_MARKET_ABI = [
    {
        type: 'event',
        name: 'TokensBought',
        inputs: [
            { name: 'buyer', type: 'address', indexed: true },
            { name: 'kubIn', type: 'uint256', indexed: false },
            { name: 'tokensOut', type: 'uint256', indexed: false },
            { name: 'feeKub', type: 'uint256', indexed: false },
            { name: 'kubReserve', type: 'uint256', indexed: false },
            { name: 'priceAfter', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'TokensSold',
        inputs: [
            { name: 'seller', type: 'address', indexed: true },
            { name: 'tokenIn', type: 'uint256', indexed: false },
            { name: 'kubOut', type: 'uint256', indexed: false },
            { name: 'feeKub', type: 'uint256', indexed: false },
            { name: 'kubReserve', type: 'uint256', indexed: false },
            { name: 'priceAfter', type: 'uint256', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Graduated',
        inputs: [
            { name: 'market', type: 'address', indexed: true },
            { name: 'token', type: 'address', indexed: true },
            { name: 'ammPool', type: 'address', indexed: true },
            { name: 'graduationAmount', type: 'uint256', indexed: false },
            { name: 'arg4', type: 'uint256', indexed: false },
            { name: 'arg5', type: 'uint256', indexed: false },
            { name: 'graduationTarget', type: 'uint8', indexed: false },
        ],
    },
] as const
