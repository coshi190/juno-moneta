export interface AggSwapEvent {
    id: string
    chainId: number
    sender: string
    tokenIn: string
    tokenOut: string
    amountIn: string
    amountOut: string
    fee: string
    legs: number
    referrer: string | null
    blockNumber: number
    timestamp: number
    transactionHash: string
}

export interface Deposit {
    id: string
    chainId: number
    tokenId: string
    owner: string
    updatedAt: number
}

export interface Incentive {
    id: string
    chainId: number
    incentiveId: string
    rewardToken: string
    pool: string
    startTime: number
    endTime: number
    refundee: string
    reward: string
    refunded: string
    endedAt: number | null
    createdAtBlock: number
    createdAtTimestamp: number
}

export interface LaunchToken {
    tokenAddr: string
    chainId: number
    creator: string
    name: string | null
    symbol: string | null
    logo: string | null
    description: string | null
    link1: string | null
    link2: string | null
    link3: string | null
    createdTime: number
    isGraduated: number | null
    graduatedAt: number | null
    createdAtBlock: number
}

export interface NativeUsdPrice {
    chainId: number
    price: string
    poolAddress: string
    updatedAt: number
}

export interface NativeUsdPriceSnapshot {
    id: string
    chainId: number
    price: string
    timestamp: number
    blockNumber: number
}

export interface ReferralBinding {
    referee: string
    referrer: string
    boundAtBlock: number
    boundAtTimestamp: number
    chainId: number
}

export interface SwapEvent {
    id: string
    chainId: number
    tokenAddr: string
    sender: string
    isBuy: number
    amountIn: string
    amountOut: string
    reserveIn: string
    reserveOut: string
    blockNumber: number
    timestamp: number
    transactionHash: string
}

export interface TokenCandle {
    id: string
    chainId: number
    tokenAddr: string
    source: string
    duration: number
    bucketTs: number
    open: number
    high: number
    low: number
    close: number
    volumeNative: number
    updatedAt: number
}

export interface TokenHolder {
    id: string
    chainId: number
    tokenAddr: string
    address: string
    balance: string
}

export interface TokenSnapshot {
    tokenAddr: string
    chainId: number
    lastPrice: string | null
    lastPriceUsd: string | null
    marketCapNative: string | null
    athMarketCapNative: string | null
    totalBuys: number | null
    totalSells: number | null
    totalVolumeNative: string | null
    holderCount: number | null
    creatorFeeNative: string | null
    creatorFeeClaimedNative: string | null
    creatorFeeToken: string | null
    creatorFeeClaimedToken: string | null
    lastSwapAt: number | null
    price1dAgo: string | null
    price1dAgoTimestamp: number | null
    priceChange1dPct: string | null
    updatedAt: number
}

export interface TransferEvent {
    id: string
    chainId: number
    tokenAddr: string
    from: string
    to: string
    amount: string
    blockNumber: number
    timestamp: number
    transactionHash: string
}

export interface UserStat {
    id: string
    chainId: number
    user: string
    volumeNative: number
    junoVolumeNative: number
    externalVolumeNative: number
    tradeCount: number
    buyCount: number
    sellCount: number
    updatedAt: number
}

export interface UserTokenPnl {
    id: string
    chainId: number
    tokenAddr: string
    user: string
    position: number
    costPoolUsd: number
    realizedUsd: number
    totalInvestedUsd: number
    updatedAt: number
}

export interface V2Pool {
    id: string
    chainId: number
    address: string
    token0: string
    token1: string
    createdAtBlock: number
    createdAtTimestamp: number
    protocol: string
}

export interface V2SwapEvent {
    id: string
    chainId: number
    poolAddress: string
    tokenAddr: string
    tokenIsToken0: number
    sender: string
    to: string
    txFrom: string
    amount0In: string
    amount1In: string
    amount0Out: string
    amount1Out: string
    blockNumber: number
    timestamp: number
    transactionHash: string
    viaFrontend: number
    referrer: string | null
    token0Addr: string
    token1Addr: string
    protocol: string
}

export interface V3Pool {
    id: string
    chainId: number
    address: string
    token0: string
    token1: string
    fee: number
    tickSpacing: number
    createdAtBlock: number
    createdAtTimestamp: number
    protocol: string
}

export interface V3PoolDayVolume {
    id: string
    chainId: number
    poolAddress: string
    dayTimestamp: number
    volumeToken0: string
    volumeToken1: string
    swapCount: number
    updatedAt: number
}

export interface V3PoolState {
    id: string
    chainId: number
    poolAddress: string
    reserve0: string
    reserve1: string
    sqrtPriceX96: string
    tick: number | null
    liquidity: string
    updatedAt: number
}

export interface V3PoolTvlDay {
    id: string
    chainId: number
    poolAddress: string
    dayTimestamp: number
    reserve0: string
    reserve1: string
    sqrtPriceX96: string
    updatedAt: number
}

export interface V3Position {
    id: string
    chainId: number
    tokenId: string
    owner: string
    token0: string
    token1: string
    fee: number
    tickLower: number
    tickUpper: number
    liquidity: string
    tokensOwed0: string
    tokensOwed1: string
    createdAtBlock: number
    updatedAt: number
}

export interface V3SwapEvent {
    id: string
    chainId: number
    poolAddress: string
    tokenAddr: string
    tokenIsToken0: number
    sender: string
    recipient: string
    txFrom: string
    amount0: string
    amount1: string
    sqrtPriceX96: string
    liquidity: string
    tick: number
    blockNumber: number
    timestamp: number
    transactionHash: string
    viaFrontend: number
    referrer: string | null
    token0Addr: string | null
    token1Addr: string | null
    protocol: string
}

export interface V3Token {
    id: string
    chainId: number
    address: string
    symbol: string | null
    name: string | null
    decimals: number | null
    createdAt: number
}

export interface V3TokenSnapshot {
    id: string
    chainId: number
    tokenAddr: string
    lastPriceNative: string | null
    lastPriceUsd: string | null
    lastSwapAt: number | null
    updatedAt: number
}

export interface PonderRootFields {
    aggSwapEvents: 'AggSwapEvent'
    deposits: 'Deposit'
    incentives: 'Incentive'
    launchTokens: 'LaunchToken'
    nativeUsdPrices: 'NativeUsdPrice'
    nativeUsdPriceSnapshots: 'NativeUsdPriceSnapshot'
    referralBindings: 'ReferralBinding'
    swapEvents: 'SwapEvent'
    tokenCandles: 'TokenCandle'
    tokenHolders: 'TokenHolder'
    tokenSnapshots: 'TokenSnapshot'
    transferEvents: 'TransferEvent'
    userStats: 'UserStat'
    userTokenPnls: 'UserTokenPnl'
    v2Pools: 'V2Pool'
    v2SwapEvents: 'V2SwapEvent'
    v3Pools: 'V3Pool'
    v3PoolDayVolumes: 'V3PoolDayVolume'
    v3PoolStates: 'V3PoolState'
    v3PoolTvlDays: 'V3PoolTvlDay'
    v3Positions: 'V3Position'
    v3SwapEvents: 'V3SwapEvent'
    v3Tokens: 'V3Token'
    v3TokenSnapshots: 'V3TokenSnapshot'
}
