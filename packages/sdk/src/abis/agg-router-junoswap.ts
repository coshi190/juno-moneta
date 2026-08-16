export const AGG_ROUTER_JUNOSWAP_ABI = [
    {
        type: 'fallback',
        stateMutability: 'nonpayable',
    },
    {
        type: 'receive',
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'KIND_V2',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint8',
                internalType: 'uint8',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'KIND_V2_NODATA',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint8',
                internalType: 'uint8',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'KIND_V3',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint8',
                internalType: 'uint8',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'MAX_FEE_BPS',
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
        type: 'function',
        name: 'NATIVE',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'WNATIVE',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
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
        name: 'factoryFeeBps',
        inputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
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
        type: 'function',
        name: 'factoryKind',
        inputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'uint8',
                internalType: 'uint8',
            },
        ],
        stateMutability: 'view',
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
        type: 'function',
        name: 'feeCollector',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'owner',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'renounceOwnership',
        inputs: [],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setFactory',
        inputs: [
            {
                name: 'factory',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'kind',
                type: 'uint8',
                internalType: 'uint8',
            },
            {
                name: 'dexFeeBps',
                type: 'uint16',
                internalType: 'uint16',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setFee',
        inputs: [
            {
                name: 'collector',
                type: 'address',
                internalType: 'address',
            },
            {
                name: 'bps',
                type: 'uint16',
                internalType: 'uint16',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'transferOwnership',
        inputs: [
            {
                name: 'newOwner',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
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
    {
        type: 'event',
        name: 'FactorySet',
        inputs: [
            {
                name: 'factory',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'kind',
                type: 'uint8',
                indexed: false,
                internalType: 'uint8',
            },
            {
                name: 'feeBps',
                type: 'uint16',
                indexed: false,
                internalType: 'uint16',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'FeeSet',
        inputs: [
            {
                name: 'collector',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'feeBps',
                type: 'uint16',
                indexed: false,
                internalType: 'uint16',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'OwnershipTransferred',
        inputs: [
            {
                name: 'previousOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'newOwner',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
        ],
        anonymous: false,
    },
] as const
