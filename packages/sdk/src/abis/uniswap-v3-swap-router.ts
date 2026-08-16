export const UNISWAP_V3_SWAP_ROUTER_ABI = [
    {
        type: 'function',
        name: 'exactInputSingle',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'exactOutputSingle',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountOut', type: 'uint256' },
                    { name: 'amountInMaximum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' },
                ],
            },
        ],
        outputs: [{ name: 'amountIn', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'exactInput',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                ],
            },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'exactOutput',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountOut', type: 'uint256' },
                    { name: 'amountInMaximum', type: 'uint256' },
                ],
            },
        ],
        outputs: [{ name: 'amountIn', type: 'uint256' }],
    },
    {
        type: 'event',
        name: 'Swap',
        inputs: [
            { name: 'sender', type: 'address', indexed: true },
            { name: 'recipient', type: 'address', indexed: true },
            { name: 'amount0', type: 'int256', indexed: false },
            { name: 'amount1', type: 'int256', indexed: false },
            { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
            { name: 'liquidity', type: 'uint128', indexed: false },
            { name: 'tick', type: 'int24', indexed: false },
        ],
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
        name: 'unwrapWETH9',
        stateMutability: 'payable',
        inputs: [
            { name: 'amountMinimum', type: 'uint256' },
            { name: 'recipient', type: 'address' },
        ],
        outputs: [],
    },
] as const
