import { ERC20_TOKEN_ABI } from './erc20-token.js'

const ALLOWANCES_NONSTANDARD = {
    type: 'function',
    name: 'allowances',
    stateMutability: 'view',
    inputs: [
        { name: 'owner', type: 'address', internalType: 'address' },
        { name: 'spender', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
} as const

export const ERC20_ABI = [...ERC20_TOKEN_ABI, ALLOWANCES_NONSTANDARD] as const
