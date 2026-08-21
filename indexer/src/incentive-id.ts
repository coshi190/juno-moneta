import { encodeAbiParameters, keccak256, type Address } from 'viem'

export interface IncentiveKey {
    rewardToken: Address
    pool: Address
    startTime: number
    endTime: number
    refundee: Address
}

export function computeIncentiveId(key: IncentiveKey): `0x${string}` {
    return keccak256(
        encodeAbiParameters(
            [
                { type: 'address', name: 'rewardToken' },
                { type: 'address', name: 'pool' },
                { type: 'uint256', name: 'startTime' },
                { type: 'uint256', name: 'endTime' },
                { type: 'address', name: 'refundee' },
            ],
            [key.rewardToken, key.pool, BigInt(key.startTime), BigInt(key.endTime), key.refundee]
        )
    )
}
