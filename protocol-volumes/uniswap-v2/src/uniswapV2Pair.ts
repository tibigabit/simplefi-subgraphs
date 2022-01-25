import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { MarketDayData, Pair } from "../generated/schema";
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

export function handleTransfer(event: Transfer): void {
  let pair = Pair.load(event.address.toHexString());

  let supplyChange = event.params.value;
  let from = event.params.from.toHexString();
  let to = event.params.to.toHexString();

  // mint
  if (from == ADDRESS_ZERO) {
    pair.totalSupply = pair.totalSupply.plus(supplyChange);
    pair.save();

    let marketDayData = getMarketDayData(event);
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.outputTokenDailyInflowVolume = marketDayData.outputTokenDailyInflowVolume.plus(
      supplyChange
    );
    marketDayData.save();
  }

  // burn
  if (to == ADDRESS_ZERO && from == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(supplyChange);
    pair.save();

    let marketDayData = getMarketDayData(event);
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.outputTokenDailyOutflowVolume = marketDayData.outputTokenDailyOutflowVolume.plus(
      supplyChange
    );
    marketDayData.save();
  }
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString()) as Pair;
  pair.reserve0 = event.params.reserve0;
  pair.reserve1 = event.params.reserve1;
  pair.save();

  let marketDayData = getMarketDayData(event);
  marketDayData.inputTokenTotalBalances = [pair.reserve0, pair.reserve1];
  marketDayData.save();
}

export function handleMint(event: Mint): void {
  let pair = Pair.load(event.address.toHexString()) as Pair;

  let marketDayData = getMarketDayData(event);

  marketDayData.inputTokenDailyInflow[0] = marketDayData.inputTokenDailyInflow[0].plus(
    event.params.amount0
  );
  marketDayData.inputTokenDailyInflow[1] = marketDayData.inputTokenDailyInflow[1].plus(
    event.params.amount1
  );

  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

export function handleBurn(event: Burn): void {
  let marketDayData = getMarketDayData(event);
  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

export function handleSwap(event: Swap): void {
  // totals for volume updates
  let amount0Total = event.params.amount0Out.plus(event.params.amount0In);
  let amount1Total = event.params.amount1Out.plus(event.params.amount1In);

  // update daily swap volume per token
  let marketDayData = getMarketDayData(event);
  marketDayData.inputTokensDailySwapVolume[0] = marketDayData.inputTokensDailySwapVolume[0].plus(
    amount0Total
  );
  marketDayData.inputTokensDailySwapVolume[1] = marketDayData.inputTokensDailySwapVolume[1].plus(
    amount1Total
  );
  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

function getMarketDayData(event: ethereum.Event): MarketDayData {
  let pairAddress = event.address.toHexString();
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayPairID = pairAddress.concat("-").concat(BigInt.fromI32(dayID).toString());

  let marketDayData = MarketDayData.load(dayPairID);
  if (marketDayData === null) {
    marketDayData = new MarketDayData(dayPairID);
    marketDayData.timestamp = event.block.timestamp;
    marketDayData.market = pairAddress;
    marketDayData.inputTokensDailySwapVolume = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.inputTokenDailyInflow = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.inputTokenDailyOutflow = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.outputTokenDailyInflowVolume = BigInt.fromI32(0);
    marketDayData.outputTokenDailyOutflowVolume = BigInt.fromI32(0);
    marketDayData.dailyTransactions = BigInt.fromI32(0);

    let pair = Pair.load(pairAddress);
    marketDayData.inputTokenTotalBalances = [pair.reserve0, pair.reserve1];
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.save();
  }

  return marketDayData as MarketDayData;
}
