export const UNISWAP_V2_ROUTER_ABI = [
    {
        type: 'function',
        name: 'getAmountsOut',
        stateMutability: 'view',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'path', type: 'address[]' },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
    {
        type: 'function',
        name: 'getAmountsIn',
        stateMutability: 'view',
        inputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'path', type: 'address[]' },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
    {
        type: 'function',
        name: 'swapExactTokensForTokens',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' },
            { name: 'path', type: 'address[]' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
    {
        type: 'function',
        name: 'swapExactETHForTokens',
        stateMutability: 'payable',
        inputs: [
            { name: 'amountOutMin', type: 'uint256' },
            { name: 'path', type: 'address[]' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
    },
    {
        type: 'function',
        name: 'swapExactTokensForETH',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'amountIn', type: 'uint256' },
            { name: 'amountOutMin', type: 'uint256' },
            { name: 'path', type: 'address[]' },
            { name: 'to', type: 'address' },
            { name: 'deadline', type: 'uint256' },
        ],
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
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
        name: 'WETH',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
    },
] as const
