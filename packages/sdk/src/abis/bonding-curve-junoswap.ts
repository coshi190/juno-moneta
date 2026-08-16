export const BONDING_CURVE_JUNOSWAP_ABI = [
    {
        type: 'receive',
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'INITIALTOKEN',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'buy',
        inputs: [
            {
                name: '_tokenAddr',
                type: 'address',
                internalType: 'address',
            },
            {
                name: '_minToken',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'createFee',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'createToken',
        inputs: [
            {
                name: '_name',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_symbol',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_logo',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_description',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_link1',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_link2',
                type: 'string',
                internalType: 'string',
            },
            {
                name: '_link3',
                type: 'string',
                internalType: 'string',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        stateMutability: 'payable',
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
        name: 'getAmountOut',
        inputs: [
            {
                name: '_inputAmount',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_inputReserve',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_outputReserve',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'pure',
    },
    {
        type: 'function',
        name: 'graduate',
        inputs: [
            {
                name: '_tokenAddr',
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
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'graduationAmount',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'initialNative',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'isGraduate',
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
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'pumpFee',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'pumpReserve',
        inputs: [
            {
                name: '',
                type: 'address',
                internalType: 'address',
            },
        ],
        outputs: [
            {
                name: 'native',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: 'token',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'sell',
        inputs: [
            {
                name: '_tokenAddr',
                type: 'address',
                internalType: 'address',
            },
            {
                name: '_tokenSold',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_minToken',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setCurveState',
        inputs: [
            {
                name: '_initialNative',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_virtualAmount',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_graduationAmount',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setFee',
        inputs: [
            {
                name: '_createFee',
                type: 'uint256',
                internalType: 'uint256',
            },
            {
                name: '_pumpFee',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        outputs: [
            {
                name: '',
                type: 'bool',
                internalType: 'bool',
            },
        ],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'setFeeCollector',
        inputs: [
            {
                name: '_newFeeCollector',
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
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'v3factory',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract IUniswapV3Factory',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'v3posManager',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract INonfungiblePositionManager',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'virtualAmount',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'uint256',
                internalType: 'uint256',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'wrappedNative',
        inputs: [],
        outputs: [
            {
                name: '',
                type: 'address',
                internalType: 'contract IERC20',
            },
        ],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'Creation',
        inputs: [
            {
                name: 'creator',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tokenAddr',
                type: 'address',
                indexed: false,
                internalType: 'address',
            },
            {
                name: 'logo',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'description',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'link1',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'link2',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'link3',
                type: 'string',
                indexed: false,
                internalType: 'string',
            },
            {
                name: 'createdTime',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
    {
        type: 'event',
        name: 'Graduation',
        inputs: [
            {
                name: 'sender',
                type: 'address',
                indexed: true,
                internalType: 'address',
            },
            {
                name: 'tokenAddr',
                type: 'address',
                indexed: false,
                internalType: 'address',
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
                name: 'isBuy',
                type: 'bool',
                indexed: true,
                internalType: 'bool',
            },
            {
                name: 'tokenAddr',
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
                name: 'reserveIn',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
            {
                name: 'reserveOut',
                type: 'uint256',
                indexed: false,
                internalType: 'uint256',
            },
        ],
        anonymous: false,
    },
] as const
