export const BONDING_CURVE_JUNOSWAP_V1_1_ABI = [
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
        name: 'curveReserve',
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
] as const
