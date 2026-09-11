export const NONFUNGIBLE_POSITION_MANAGER_ABI = [
    {
        type: 'function',
        name: 'approve',
        inputs: [
            {
                name: 'to',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'balanceOf',
        inputs: [
            {
                name: 'owner',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: 'balance',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'collect',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                internalType: 'struct INonfungiblePositionManager.CollectParams',
                components: [
                    {
                        name: 'tokenId',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'recipient',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'amount0Max',
                        type: 'uint128',
                        internalType: 'uint128',
                    },
                    {
                        name: 'amount1Max',
                        type: 'uint128',
                        internalType: 'uint128',
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'amount0',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'amount1',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'createAndInitializePoolIfNecessary',
        inputs: [
            {
                name: 'token0',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'token1',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'fee',
                type: 'uint24',
                internalType: 'uint24',
            },
            {
                name: 'sqrtPriceX96',
                type: 'uint160',
                internalType: 'uint160',
            },
        ],
        outputs: [
            {
                name: 'pool',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'decreaseLiquidity',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                internalType: 'struct INonfungiblePositionManager.DecreaseLiquidityParams',
                components: [
                    {
                        name: 'tokenId',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'liquidity',
                        type: 'uint128',
                        internalType: 'uint128',
                    },
                    {
                        name: 'amount0Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount1Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'deadline',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'amount0',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'amount1',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'getApproved',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'operator',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'increaseLiquidity',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                internalType: 'struct INonfungiblePositionManager.IncreaseLiquidityParams',
                components: [
                    {
                        name: 'tokenId',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount0Desired',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount1Desired',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount0Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount1Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'deadline',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'liquidity',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'amount0',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'amount1',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'isApprovedForAll',
        inputs: [
            {
                name: 'owner',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'operator',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'mint',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                internalType: 'struct INonfungiblePositionManager.MintParams',
                components: [
                    {
                        name: 'token0',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'token1',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'fee',
                        type: 'uint24',
                        internalType: 'uint24',
                    },
                    {
                        name: 'tickLower',
                        type: 'int24',
                        internalType: 'int24',
                    },
                    {
                        name: 'tickUpper',
                        type: 'int24',
                        internalType: 'int24',
                    },
                    {
                        name: 'amount0Desired',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount1Desired',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount0Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'amount1Min',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'recipient',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'deadline',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'liquidity',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'amount0',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'amount1',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'multicall',
        inputs: [
            {
                name: 'data',
                type: 'bytes[]',
                internalType: 'bytes[]',
            },
        ],
        outputs: [
            {
                name: 'results',
                type: 'bytes[]',
                internalType: 'bytes[]',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'positions',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'nonce',
                type: 'uint96',
                internalType: 'uint96',
            },
            {
                name: 'operator',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'token0',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'token1',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'fee',
                type: 'uint24',
                internalType: 'uint24',
            },
            {
                name: 'tickLower',
                type: 'int24',
                internalType: 'int24',
            },
            {
                name: 'tickUpper',
                type: 'int24',
                internalType: 'int24',
            },
            {
                name: 'liquidity',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'feeGrowthInside0LastX128',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'feeGrowthInside1LastX128',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'tokensOwed0',
                type: 'uint128',
                internalType: 'uint128',
            },
            {
                name: 'tokensOwed1',
                type: 'uint128',
                internalType: 'uint128',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'refundETH',
        inputs: [],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'sweepToken',
        inputs: [
            {
                name: 'token',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'amountMinimum',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'recipient',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'tokenOfOwnerByIndex',
        inputs: [
            {
                name: 'owner',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'index',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'unwrapWETH9',
        inputs: [
            {
                name: 'amountMinimum',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'recipient',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'event',
        name: 'Collect',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'recipient',
                type: 'address',
                indexed: false,
                internalType: 'address',
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
        name: 'DecreaseLiquidity',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'liquidity',
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
        name: 'IncreaseLiquidity',
        inputs: [
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
            {
                name: 'liquidity',
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
        name: 'Transfer',
        inputs: [
            {
                name: 'from',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'to',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tokenId',
                type: 'uint256',
                indexed: true,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
] as const
