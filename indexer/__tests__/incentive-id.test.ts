import { describe, it, expect } from 'vitest'
import { computeIncentiveId, type IncentiveKey } from '../src/incentive-id'

const TESTNET_KEY: IncentiveKey = {
    rewardToken: '0x23352915164527e0AB53Ca5519aec5188aa224A2',
    pool: '0x81182579f4271B910bF108913Be78F0D9C44AaBa',
    startTime: 1764152820,
    endTime: 1795688820,
    refundee: '0xCA811301C650C92fD45ed32A81C0B757C61595b6',
}

describe('computeIncentiveId', () => {
    it('matches the on-chain id for a live incentive', () => {
        expect(computeIncentiveId(TESTNET_KEY)).toBe(
            '0x26d52c050f9b613112df94d71586188fc3896697329fa5b7bc29476dfde5fb70'
        )
    })
})
