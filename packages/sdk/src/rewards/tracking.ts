import { concat, type Address, type Hex } from 'viem'

const JUNOSWAP_CALLDATA_MARKER = '0x6a756e6f' as const
const MARKER_HEX = JUNOSWAP_CALLDATA_MARKER.slice(2)
const SUFFIX_HEX_LEN = (4 + 20) * 2

export const DEFAULT_REFERRER: Address = '0x0000000000000000000000000000000000000000'

export interface TrackingTag {
    referrer: string | null
    binding: { referee: string; referrer: string } | null
}

export function appendTrackingTag(data: Hex, referrer: Address | null): Hex {
    return concat([data, JUNOSWAP_CALLDATA_MARKER, referrer ?? DEFAULT_REFERRER])
}

export function readTrackingTag(
    input: string | null | undefined,
    txFrom: string
): TrackingTag | null {
    if (!input) return null
    const data = input.toLowerCase()
    if (data.length < 2 + SUFFIX_HEX_LEN) return null
    const suffix = data.slice(-SUFFIX_HEX_LEN)
    if (!suffix.startsWith(MARKER_HEX)) return null
    const tagged = '0x' + suffix.slice(MARKER_HEX.length)
    const referrer = tagged === DEFAULT_REFERRER ? null : tagged
    const referee = txFrom.toLowerCase()
    const binding = referrer && referrer !== referee ? { referee, referrer } : null
    return { referrer, binding }
}
