import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import { MasterChef, AddCall, Deposit } from "../../generated/MasterChef/MasterChef";

import { Transfer } from "../../generated/templates/RewardToken/IERC20";

import { IRewarder } from "../../generated/MasterChefV2/IRewarder";

import {
  SushiFarm,
  SushiFarmSnapshot,
  FarmDeposit,
  FarmWithdrawal,
  UserInfo,
  Market,
  Account,
  Token,
  SushiRewardTransfer,
  ExtraRewardTokenTransfer,
  MasterChef as MasterChefEntity,
  Rewarder,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  ADDRESS_ZERO,
} from "../library/common";

import { getOrCreateUserInfo } from "../library/masterChefUtils";

import { RewardToken } from "../../generated/templates";

import { ProtocolName, ProtocolType } from "../library/constants";

// hard-coded as in contract
let ACC_SUSHI_PRECISION: BigInt = BigInt.fromI32(10).pow(12);

/**
 *
 * @param call
 */
export function handleAdd(call: AddCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString());

  // "fake" event containing block info
  let event = new ethereum.Event();
  event.block = call.block;

  // create MasterChef entity and store Sushi token address
  if (masterChef == null) {
    masterChef = new MasterChefEntity(call.to.toHexString());
    masterChef.version = BigInt.fromI32(1);

    // get sushi address, store it and start indexer if needed
    let masterChefContract = MasterChef.bind(call.to);
    let sushi = masterChefContract.sushi();

    let token = Token.load(sushi.toHexString());
    if (token == null) {
      // start indexing SUSHI events
      RewardToken.create(sushi);
    }

    let sushiToken = getOrCreateERC20Token(event, sushi);
    masterChef.sushi = sushiToken.id;
    masterChef.numberOfFarms = BigInt.fromI32(0);
    masterChef.save();
  }

  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(masterChef.id + "-" + masterChef.numberOfFarms.toString());
  sushiFarm.farmPid = masterChef.numberOfFarms;
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.allocPoint = call.inputs._allocPoint;
  sushiFarm.created = call.block.timestamp;
  sushiFarm.createdAtBlock = call.block.number;
  sushiFarm.createdAtTransaction = call.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, call.inputs._lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardBlock = call.block.number;
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // numberOfFarms++
  masterChef.numberOfFarms = masterChef.numberOfFarms.plus(BigInt.fromI32(1));
  masterChef.save();

  // create market representing the farm
  let marketId = sushiFarm.id;
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];
  let rewardTokens: Token[] = [getOrCreateERC20Token(event, Address.fromString(masterChef.sushi))];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    null,
    rewardTokens
  );
}

/**
 * User deposits his LP tokens to farm
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let user = getOrCreateAccount(event.params.user);
  let amount = event.params.amount;

  // save new deposit entity
  let deposit = new FarmDeposit(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  deposit.transactionHash = event.transaction.hash.toHexString();
  deposit.sushiFarm = sushiFarm.id;
  deposit.depositer = user.id;
  deposit.amount = amount;
  deposit.save();

  // don't update user's position for 0 value deposit
  if (deposit.amount == BigInt.fromI32(0)) {
    return;
  }

  // calculate harvested Sushi amount
  let userInfo = getOrCreateUserInfo(user.id, sushiFarm.id);
  let harvestedSushi = userInfo.amount
    .times(sushiFarm.accSushiPerShare)
    .div(ACC_SUSHI_PRECISION)
    .minus(userInfo.rewardDebt);

  // increase user's balance of provided LP tokens and amount of rewards entitled to user
  userInfo.amount = userInfo.amount.plus(amount);
  userInfo.rewardDebt = userInfo.amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION);
  userInfo.save();

  ////// update market LP supply

  // update sushifarm
  sushiFarm.totalSupply = sushiFarm.totalSupply.plus(amount);
  sushiFarm.save();

  // update market
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );

  ////// update user's position

  // sushi farms don't have output token
  let outputTokenAmount = BigInt.fromI32(0);

  // user deposited `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of Sushi tokens user received in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], user.id, harvestedSushi));

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, user.id, userInfo.amount));

  // Sushi amount claimable by user - at this point it is 0 as all the pending reward Sushi has just
  // been transferred to user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, BigInt.fromI32(0)),
  ];

  investInMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}
