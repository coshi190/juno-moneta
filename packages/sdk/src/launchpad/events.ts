import { decodeEventLog } from 'viem'
import type { Address, Log } from 'viem'
import { BONDING_CURVE_JUNOSWAP_ABI } from '../abis/index.js'

export function parseTokenAddressFromLogs(
    logs: Log[],
    bondingCurveAddress?: Address
): Address | null {
    const expected = bondingCurveAddress?.toLowerCase()
    for (const log of logs) {
        if (expected && log.address.toLowerCase() !== expected) continue
        try {
            const decoded = decodeEventLog({
                abi: BONDING_CURVE_JUNOSWAP_ABI,
                data: log.data,
                topics: log.topics,
            })
            if (decoded.eventName === 'Creation') {
                return (decoded.args as { tokenAddr: Address }).tokenAddr
            }
        } catch {
            continue
        }
    }
    return null
}
