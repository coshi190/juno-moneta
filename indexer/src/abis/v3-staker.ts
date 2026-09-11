export const V3_STAKER_ABI = [
    {
        type: 'event',
        name: 'IncentiveCreated',
        inputs: [
            { name: 'rewardToken', type: 'address', indexed: true },
            { name: 'pool', type: 'address', indexed: true },
            { name: 'startTime', type: 'uint256', indexed: false },
            { name: 'endTime', type: 'uint256', indexed: false },
            { name: 'refundee', type: 'address', indexed: false },
            { name: 'reward', type: 'uint256', indexed: false },
        ],
    },

    {
        type: 'event',
        name: 'DepositTransferred',
        inputs: [
            { name: 'tokenId', type: 'uint256', indexed: true },
            { name: 'oldOwner', type: 'address', indexed: true },
            { name: 'newOwner', type: 'address', indexed: true },
        ],
    },
] as const
