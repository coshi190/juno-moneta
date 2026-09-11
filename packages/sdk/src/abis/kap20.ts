import { ERC20_ABI } from './erc20.js'

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

export const KAP20_ABI = [...ERC20_ABI, ALLOWANCES_NONSTANDARD] as const
