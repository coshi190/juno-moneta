export const UNISWAP_V3_STAKER_ABI = [
    {
        type: 'function',
        name: 'stakeToken',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'tokenId', type: 'uint256' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'unstakeToken',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'tokenId', type: 'uint256' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'claimReward',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'rewardToken', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amountRequested', type: 'uint256' },
        ],
        outputs: [{ name: 'reward', type: 'uint256' }],
    },

    {
        type: 'function',
        name: 'withdrawToken',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'transferDeposit',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'to', type: 'address' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'createIncentive',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'reward', type: 'uint256' },
        ],
        outputs: [],
    },

    {
        type: 'function',
        name: 'endIncentive',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
        ],
        outputs: [{ name: 'refund', type: 'uint256' }],
    },

    {
        type: 'function',
        name: 'multicall',
        stateMutability: 'payable',
        inputs: [{ name: 'data', type: 'bytes[]' }],
        outputs: [{ name: 'results', type: 'bytes[]' }],
    },

    {
        type: 'function',
        name: 'getRewardInfo',
        stateMutability: 'view',
        inputs: [
            {
                name: 'key',
                type: 'tuple',
                components: [
                    { name: 'rewardToken', type: 'address' },
                    { name: 'pool', type: 'address' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'refundee', type: 'address' },
                ],
            },
            { name: 'tokenId', type: 'uint256' },
        ],
        outputs: [
            { name: 'reward', type: 'uint256' },
            { name: 'secondsInsideX128', type: 'uint160' },
        ],
    },

    {
        type: 'function',
        name: 'deposits',
        stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [
            { name: 'owner', type: 'address' },
            { name: 'numberOfStakes', type: 'uint48' },
            { name: 'tickLower', type: 'int24' },
            { name: 'tickUpper', type: 'int24' },
        ],
    },

    {
        type: 'function',
        name: 'incentives',
        stateMutability: 'view',
        inputs: [{ name: 'incentiveId', type: 'bytes32' }],
        outputs: [
            { name: 'totalRewardUnclaimed', type: 'uint256' },
            { name: 'totalSecondsClaimedX128', type: 'uint160' },
            { name: 'numberOfStakes', type: 'uint96' },
        ],
    },

    {
        type: 'function',
        name: 'stakes',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenId', type: 'uint256' },
            { name: 'incentiveId', type: 'bytes32' },
        ],
        outputs: [
            { name: 'secondsPerLiquidityInsideInitialX128', type: 'uint160' },
            { name: 'liquidity', type: 'uint128' },
        ],
    },

    {
        type: 'function',
        name: 'rewards',
        stateMutability: 'view',
        inputs: [
            { name: 'rewardToken', type: 'address' },
            { name: 'owner', type: 'address' },
        ],
        outputs: [{ name: 'rewardsOwed', type: 'uint256' }],
    },

    {
        type: 'function',
        name: 'nonfungiblePositionManager',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },

    {
        type: 'function',
        name: 'factory',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },

    {
        type: 'function',
        name: 'maxIncentiveDuration',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },

    {
        type: 'function',
        name: 'maxIncentiveStartLeadTime',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },

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
        name: 'IncentiveEnded',
        inputs: [
            { name: 'incentiveId', type: 'bytes32', indexed: true },
            { name: 'refund', type: 'uint256', indexed: false },
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

    {
        type: 'event',
        name: 'TokenStaked',
        inputs: [
            { name: 'tokenId', type: 'uint256', indexed: true },
            { name: 'incentiveId', type: 'bytes32', indexed: true },
            { name: 'liquidity', type: 'uint128', indexed: false },
        ],
    },

    {
        type: 'event',
        name: 'TokenUnstaked',
        inputs: [
            { name: 'tokenId', type: 'uint256', indexed: true },
            { name: 'incentiveId', type: 'bytes32', indexed: true },
        ],
    },

    {
        type: 'event',
        name: 'RewardClaimed',
        inputs: [
            { name: 'to', type: 'address', indexed: true },
            { name: 'reward', type: 'uint256', indexed: false },
        ],
    },
] as const
