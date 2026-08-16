import { concat, isAddress, type Address, type Hex } from 'viem'

export const JUNOSWAP_CALLDATA_MARKER = '0x6a756e6f' as const

export const DEFAULT_REFERRER: Address = '0x0000000000000000000000000000000000000000'

export function buildTrackingSuffix(referrer: Address): Hex {
    return concat([JUNOSWAP_CALLDATA_MARKER, referrer])
}

export function appendTrackingTag(data: Hex, referrer: Address): Hex {
    return concat([data, buildTrackingSuffix(referrer)])
}

export function normalizeReferrer(raw: string | null | undefined): Address {
    return raw && isAddress(raw) ? (raw as Address) : DEFAULT_REFERRER
}

const MARKER_HEX = JUNOSWAP_CALLDATA_MARKER.slice(2)
const SUFFIX_HEX_LEN = (4 + 20) * 2

export function parseTrackingTag(
    input: string | undefined | null
): { referrer: string | null } | null {
    if (!input) return null
    const data = input.toLowerCase()
    if (data.length < 2 + SUFFIX_HEX_LEN) return null
    const suffix = data.slice(-SUFFIX_HEX_LEN)
    if (!suffix.startsWith(MARKER_HEX)) return null
    const referrer = '0x' + suffix.slice(MARKER_HEX.length)
    return { referrer: referrer === DEFAULT_REFERRER ? null : referrer }
}

export function resolveBinding(
    referee: string,
    referrer: string | null
): { referee: string; referrer: string } | null {
    if (!referrer) return null
    const a = referee.toLowerCase()
    const b = referrer.toLowerCase()
    return a === b ? null : { referee: a, referrer: b }
}
