import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";

import {
  MasterChefV2,
  Deposit,
  Withdraw,
  EmergencyWithdraw,
  Harvest,
  LogPoolAddition,
  LogUpdatePool,
  LogSetPool,
} from "../../generated/MasterChefV2/MasterChefV2";

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
  MasterChef,
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

import { RewardToken } from "../../generated/templates";

import { ProtocolName, ProtocolType } from "../library/constants";

let oneE12: BigInt = BigInt.fromI32(10).pow(12);

/**
 *
 * @param event
 */
export function handleLogPoolAddition(event: LogPoolAddition): void {
  // create MasterChef entity
  let masterChef = MasterChef.load(event.address.toHexString());
  if (masterChef == null) {
    masterChef = new MasterChef(event.address.toHexString());
  }

  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(event.params.pid.toString());
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.rewarder = event.params.rewarder.toHexString();
  sushiFarm.allocPoint = event.params.allocPoint;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, event.params.lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardBlock = BigInt.fromI32(0);
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // create market representing the farm
  let marketId = sushiFarm.masterChef.concat("-").concat(sushiFarm.id);
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];

  let rewardTokens: Token[] = getRewardTokens(sushiFarm, event);

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
 *
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());
  let user = getOrCreateAccount(event.params.user);
  let receiver = getOrCreateAccount(event.params.to);
  let amount = event.params.amount;

  // save new deposit entity
  let deposit = new FarmDeposit(
    event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toHexString())
  );
  deposit.sushiFarm = sushiFarm.id;
  deposit.depositer = user.id;
  deposit.depositReceiver = receiver.id;
  deposit.amount = amount;
  deposit.save();

  // don't update user's position for 0 value deposit
  if (deposit.amount == BigInt.fromI32(0)) {
    return;
  }

  ////// update user's position
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;

  let userInfo = getOrCreateUserInfo(receiver.id, sushiFarm.id);
  userInfo.amount = userInfo.amount.plus(amount);
  userInfo.rewardDebt = userInfo.rewardDebt.plus(
    amount.times(sushiFarm.accSushiPerShare).div(oneE12)
  );
  userInfo.save();

  let outputTokenAmount = BigInt.fromI32(0);
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, deposit.depositReceiver, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, deposit.depositReceiver, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, receiver, rewardTokenBalances, market);

  investInMarket(
    event,
    receiver,
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

/**
 *
 * @param event
 * @returns
 */
export function handleWithdraw(event: Withdraw): void {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());
  let user = getOrCreateAccount(event.params.user);
  let receiver = getOrCreateAccount(event.params.to);
  let amount = event.params.amount;

  // save new deposit entity
  let withdrawal = new FarmWithdrawal(
    event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toHexString())
  );
  withdrawal.sushiFarm = sushiFarm.id;
  withdrawal.withdrawer = user.id;
  withdrawal.withdrawalReceiver = receiver.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // don't update user's position for 0 value withdrawal
  if (withdrawal.amount == BigInt.fromI32(0)) {
    return;
  }

  ////// update user's position
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;

  let userInfo = getOrCreateUserInfo(receiver.id, sushiFarm.id);
  userInfo.amount = userInfo.amount.minus(amount);
  userInfo.rewardDebt = userInfo.rewardDebt.minus(
    amount.times(sushiFarm.accSushiPerShare).div(oneE12)
  );
  userInfo.save();

  let outputTokenAmount = BigInt.fromI32(0);
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, receiver, rewardTokenBalances, market);

  redeemFromMarket(
    event,
    receiver,
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

/**
 *
 * @param event
 * @returns
 */
export function handleEmergencyWithdraw(event: EmergencyWithdraw): void {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());
  let user = getOrCreateAccount(event.params.user);
  let receiver = getOrCreateAccount(event.params.to);
  let amount = event.params.amount;

  // save new deposit entity
  let withdrawal = new FarmWithdrawal(
    event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toHexString())
  );
  withdrawal.sushiFarm = sushiFarm.id;
  withdrawal.withdrawer = user.id;
  withdrawal.withdrawalReceiver = receiver.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // don't update user's position for empty emergency withdrawal
  if (withdrawal.amount == BigInt.fromI32(0)) {
    return;
  }

  ////// update user's position
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;

  let userInfo = getOrCreateUserInfo(receiver.id, sushiFarm.id);
  userInfo.amount = BigInt.fromI32(0);
  userInfo.rewardDebt = BigInt.fromI32(0);
  userInfo.save();

  let outputTokenAmount = BigInt.fromI32(0);
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, receiver, rewardTokenBalances, market);

  redeemFromMarket(
    event,
    receiver,
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

/**
 * Harvest
 * @param event
 * @returns
 */
export function handleHarvest(event: Harvest): void {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());
  let harvester = getOrCreateAccount(event.params.user);
  let harvestedSushiAmount = event.params.amount;

  // don't update user's position for 0 value harvest
  if (harvestedSushiAmount == BigInt.fromI32(0)) {
    return;
  }

  // get sushi receiver (it doesn't have to be harvester himself) by checking preceding Sushi transfer
  let transfer = SushiRewardTransfer.load(event.transaction.hash.toHexString());
  let sushiReceiver = transfer.to;

  ////// update user's position
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;

  let userInfo = getOrCreateUserInfo(harvester.id, sushiFarm.id);
  userInfo.rewardDebt = userInfo.amount.times(sushiFarm.accSushiPerShare).div(oneE12);
  userInfo.save();

  let outputTokenAmount = BigInt.fromI32(0);

  // no input tokens received in this transaction, only reward tokens
  let inputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  // TODO add rewards other than SUSHI
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenAmounts: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], sushiReceiver, harvestedSushiAmount),
  ];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by account's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, userInfo.id, userInfo.amount));

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, harvester, rewardTokenBalances, market);

  redeemFromMarket(
    event,
    harvester,
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

/**
 *
 * @param event
 */
export function handleLogUpdatePool(event: LogUpdatePool) {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());

  // create farm snapshot
  let snapshotId = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(event.logIndex.toHexString());
  let farmSnapshot = new SushiFarmSnapshot(snapshotId);
  farmSnapshot.sushiFarm = sushiFarm.id;
  farmSnapshot.allocPoint = sushiFarm.allocPoint;
  farmSnapshot.totalSupply = sushiFarm.totalSupply;
  farmSnapshot.timestamp = event.block.timestamp;
  farmSnapshot.transactionHash = event.transaction.hash.toHexString();
  farmSnapshot.transactionIndexInBlock = event.transaction.index;
  farmSnapshot.blockNumber = event.block.number;
  farmSnapshot.logIndex = event.logIndex;
  farmSnapshot.save();

  // update sushifarm
  sushiFarm.lastRewardBlock = event.params.lastRewardBlock;
  sushiFarm.totalSupply = event.params.lpSupply;
  sushiFarm.accSushiPerShare = event.params.accSushiPerShare;
  sushiFarm.save();

  // update market
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );
}

/**
 *
 * @param event
 */
export function handleSetPool(event: LogSetPool) {
  let sushiFarm = SushiFarm.load(event.params.pid.toString());

  // update sushifarm
  sushiFarm.allocPoint = event.params.allocPoint;
  if (event.params.overwrite) {
    sushiFarm.rewarder = event.params.rewarder.toHexString();
  }
  sushiFarm.save();
}

/**
 * Save Sushi transfer from MasterChef to user
 * @param event
 */
export function handleRewardTokenTransfer(event: Transfer) {
  // we're only interested in transfers where sender is the masterchef
  let from = getOrCreateAccount(event.params.from);
  let masterChef = MasterChef.load(from.id);
  if (masterChef == null) {
    return;
  }

  let receiver = getOrCreateAccount(event.params.to);
  let transfer = new SushiRewardTransfer(event.transaction.hash.toHexString());
  transfer.from = from.id;
  transfer.to = receiver.id;
  transfer.value = event.params.value;
  transfer.save();
}

/**
 * Get reward tokens of a pool by fetching sushi token address and additionally fetch
 * extra reward tokens by calling pendingTokens function of rewarder contract.
 * Additionaly, start indexing reward tokens based on ERC20 template.
 * @param sushiFarm
 * @returns
 */
function getRewardTokens(sushiFarm: SushiFarm, event: ethereum.Event): Token[] {
  let tokens: Token[] = [];
  let masterChef = MasterChefV2.bind(Address.fromString(sushiFarm.masterChef));

  // get sushi address, store it and start indexer if needed
  let sushi = masterChef.try_SUSHI();
  if (!sushi.reverted) {
    let sushiAddress = sushi.value;

    let token = Token.load(sushiAddress.toHexString());
    if (token == null) {
      // start indexing SUSHI events
      RewardToken.create(sushiAddress);
    }

    tokens.push(getOrCreateERC20Token(event, sushiAddress));
  }

  // get extra reward tokens
  let rewarder = IRewarder.bind(Address.fromString(sushiFarm.rewarder));
  let result = rewarder.try_pendingTokens(
    BigInt.fromI32(0),
    Address.fromString(ADDRESS_ZERO),
    BigInt.fromI32(0)
  );
  if (!result.reverted) {
    let extraRewardTokens: Address[] = result.value.value0;
    for (let i: i32 = 0; i < extraRewardTokens.length; i++) {
      tokens.push(new Token(extraRewardTokens[i].toHexString()));
    }
  }

  return tokens;
}

/**
 * Create UserInfo entity
 * @param user
 * @param farmPid
 * @returns
 */
function getOrCreateUserInfo(user: string, farmPid: string): UserInfo {
  let id = user.concat("-").concat(farmPid);
  let userInfo = UserInfo.load(id) as UserInfo;

  if (userInfo == null) {
    userInfo = new UserInfo(id);
    userInfo.amount = BigInt.fromI32(0);
    userInfo.rewardDebt = BigInt.fromI32(0);
  }

  return userInfo;
}

function collectRewardTokenBalances(
  sushiFarm: SushiFarm,
  receiver: Account,
  rewardTokenBalances: TokenBalance[],
  market: Market
) {
  // fetch claimable amount of sushi
  // fetch claimable a
}
