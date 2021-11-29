import { 
  BigInt, 
  ethereum, 
  Address,
  store,
} from "@graphprotocol/graph-ts"

import { 
  Pool as PoolEntity, 
  Market as MarketEntity,
  Account as AccountEntity,
  Mint as MintEntity,
  Burn as BurnEntity,
  AccountLiquidity as AccountLiquidityEntity,
} from "../generated/schema"

import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  updateMarket,
  TokenBalance,
} from "./common"

export function getOrCreateLiquidity(pool: PoolEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = pool.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.pool = pool.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

export function getOrCreateMint(event: ethereum.Event, pool: PoolEntity): MintEntity {
  let mint = MintEntity.load(event.transaction.hash.toHexString())
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(event.transaction.hash.toHexString())
  mint.pool = pool.id
  mint.transferEventApplied = false
  mint.poolBalanceEventApplied = false
  mint.save()
  return mint as MintEntity
}

export function createOrUpdatePositionOnMint(event: ethereum.Event, pool: PoolEntity, mint: MintEntity): void {
  if (!mint.transferEventApplied || !mint.poolBalanceEventApplied) {
    return
  }

  let accountAddress = Address.fromString(mint.to)
  let account = new AccountEntity(mint.to)
  let market = MarketEntity.load(mint.pool) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  
  let outputTokenBalance = accountLiquidity.balance
  let inputTokenBalances: TokenBalance[] = []

  let marketInputTokenBalances: TokenBalance[] = []

  for (let i = 0; i < pool.tokens.length; i++) {
    // @todo: can I trust mint.amounts ordering matching pool.tokens?
    let tokens = pool.tokens as string[]
    let mintAmounts = mint.amounts as BigInt[]
    inputTokenAmounts.push(new TokenBalance(tokens[i], mint.to, mintAmounts[i] as BigInt))

    let poolReserves = pool.reserves as BigInt[]
    let tokenBalance = outputTokenBalance.times(poolReserves[i]).div(pool.totalSupply as BigInt)
    inputTokenBalances.push(new TokenBalance(tokens[i], mint.to, tokenBalance))

    marketInputTokenBalances.push(new TokenBalance(tokens[i], pool.id, poolReserves[i]))
  }

  investInMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalSupply as BigInt
  )

  store.remove('Mint', mint.id)
}

export function getOrCreateBurn(event: ethereum.Event, pool: PoolEntity): BurnEntity {
  let burn = BurnEntity.load(event.transaction.hash.toHexString())
  if (burn != null) {
    return burn as BurnEntity
  }

  burn = new BurnEntity(event.transaction.hash.toHexString())
  burn.transferEventApplied = false
  burn.poolBalanceEventApplied = false
  burn.pool = pool.id
  burn.save()

  return burn as BurnEntity
}

export function createOrUpdatePositionOnBurn(event: ethereum.Event, pool: PoolEntity, burn: BurnEntity): void {
  if (!burn.transferEventApplied || !burn.poolBalanceEventApplied) {
    return
  }

  let accountAddress = Address.fromString(burn.to)
  let account = new AccountEntity(burn.to)
  let market = MarketEntity.load(burn.pool) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  let outputTokenBalance = accountLiquidity.balance
  let inputTokenBalances: TokenBalance[] = []
  let marketInputTokenBalances: TokenBalance[] = []

  for (let i = 0; i < pool.tokens.length; i++) {
    let tokens = pool.tokens as string[]
    let burnAmounts = burn.amounts as BigInt[]
    inputTokenAmounts.push(new TokenBalance(tokens[i], burn.to, burnAmounts[i] as BigInt))

    let poolReserves = pool.reserves as BigInt[]
    let tokenBalance = outputTokenBalance.times(poolReserves[i]).div(pool.totalSupply as BigInt)
    inputTokenBalances.push(new TokenBalance(tokens[i], burn.to, tokenBalance))

    marketInputTokenBalances.push(new TokenBalance(tokens[i], pool.id, poolReserves[i]))
  }

  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalSupply as BigInt
  )

  store.remove('Burn', burn.id)
}
