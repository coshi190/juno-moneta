export const FEE_COLLECTOR_ABI = [
    {
        type: 'event',
        name: 'FeeShared',
        inputs: [
            { name: 'tokenAddr', type: 'address', indexed: true },
            { name: 'creator', type: 'address', indexed: true },
            { name: 'creatorAmount', type: 'uint256', indexed: false },
            { name: 'treasuryAmount', type: 'uint256', indexed: false },
            { name: 'isNative', type: 'bool', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'Claimed',
        inputs: [
            { name: 'account', type: 'address', indexed: true },
            { name: 'tokenAddr', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256', indexed: false },
        ],
    },
] as const
