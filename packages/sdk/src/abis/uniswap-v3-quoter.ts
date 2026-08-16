export const UNISWAP_V3_QUOTER_V2_ABI = [
    {
        type: 'function',
        name: 'quoteExactInputSingle',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [
            {
                name: 'amountOut',
                type: 'uint256',
            },
            {
                name: 'sqrtPriceX96After',
                type: 'uint160',
            },
            {
                name: 'initializedTicksCrossed',
                type: 'uint32',
            },
            {
                name: 'gasEstimate',
                type: 'uint256',
            },
        ],
    },
    {
        type: 'function',
        name: 'quoteExactOutputSingle',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'amountOut', type: 'uint256' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [
            {
                name: 'amountIn',
                type: 'uint256',
            },
            {
                name: 'sqrtPriceX96After',
                type: 'uint160',
            },
            {
                name: 'initializedTicksCrossed',
                type: 'uint32',
            },
            {
                name: 'gasEstimate',
                type: 'uint256',
            },
        ],
    },
    {
        type: 'function',
        name: 'quoteExactInput',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'path', type: 'bytes' },
            { name: 'amountIn', type: 'uint256' },
        ],
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96AfterList', type: 'uint160[]' },
            { name: 'initializedTicksCrossedList', type: 'uint32[]' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
    },
] as const
