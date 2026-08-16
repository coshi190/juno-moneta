import type { Address } from 'viem'

export interface IncentiveKey {
    rewardToken: Address
    pool: Address
    startTime: number
    endTime: number
    refundee: Address
}
