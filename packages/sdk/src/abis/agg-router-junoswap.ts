export const AGG_ROUTER_JUNOSWAP_ABI = [
    {
        type: 'function',
        name: 'aggregate',
        inputs: [
            {
                name: 'p',
                type: 'tuple',
                internalType: 'struct AggRouterJunoswap.AggregateParams',
                components: [
                    {
                        name: 'tokenIn',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'tokenOut',
                        type: 'address',
                        internalType: 'address',
                    },
                    {
                        name: 'amountIn',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'minAmountOut',
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
                    {
                        name: 'unwrapOut',
                        type: 'bool',
                        internalType: 'bool',
                    },
                    {
                        name: 'referrer',
                        type: 'address',
                        internalType: 'address',
                    },
                ],
            },
            {
                name: 'legs',
                type: 'tuple[]',
                internalType: 'struct AggRouterJunoswap.Leg[]',
                components: [
                    {
                        name: 'amountIn',
                        type: 'uint256',
                        internalType: 'uint256',
                    },
                    {
                        name: 'hops',
                        type: 'tuple[]',
                        internalType: 'struct AggRouterJunoswap.Hop[]',
                        components: [
                            {
                                name: 'factory',
                                type: 'address',
                                internalType: 'address',
                            },
                            {
                                name: 'swapData',
                                type: 'bytes',
                                internalType: 'bytes',
                            },
                        ],
                    },
                ],
            },
        ],
        outputs: [
            {
                name: 'amountOut',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'feeBps',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint16',
                internalType: 'uint16',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'Aggregated',
        inputs: [
            {
                name: 'sender',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tokenIn',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tokenOut',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'amountIn',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'amountOut',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'fee',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'legs',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'referrer',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
] as const
