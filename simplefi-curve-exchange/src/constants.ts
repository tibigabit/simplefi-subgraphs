import { TypedMap } from "@graphprotocol/graph-ts";

export namespace Blockchain {
  export const ETHEREUM = "ETHEREUM";
  export const BSC = "BSC";
  export const XDAI = "XDAI";
  export const POLYGON = "POLYGON";
  export const OPTIMISM = "OPTIMISM";
  export const AVALANCHE = "AVALANCE";
  export const NEAR = "NEAR";
}

export namespace TokenStandard {
  export const ERC20 = "ERC20";
  export const ERC721 = "ERC721";
  export const ERC1155 = "ERC1155";
}

export namespace ProtocolName {
  export const UNISWAP_V2 = "UNISWAP_V2";
  export const CURVE_POOL = "CURVE_POOL";
}

export namespace ProtocolType {
  export const STAKING = "STAKING";
  export const LENDING = "LENDING";
  export const EXCHANGE = "EXCHANGE";
  export const INSURANCE = "INSURANCE";
  export const STABLECOIN = "STABLECOIN";
  export const DERIVATIVE = "DERIVATIVE";
  export const SYNTHETIC_TOKEN = "SYNTHETIC_TOKEN";
  export const TOKEN_MANAGEMENT = "TOKEN_MANAGEMENT";
  export const PREDICTION_MARKET = "PREDICTION_MARKET";
}

export namespace PositionType {
  export const INVESTMENT = "INVESTMENT";
  export const DEBT = "DEBT";
}

export namespace TransactionType {
  export const INVEST = "INVEST";
  export const REDEEM = "REDEEM";
  export const BORROW = "BORROW";
  export const REPAY = "REPAY";
  export const TRANSFER_IN = "TRANSFER_IN";
  export const TRANSFER_OUT = "TRANSFER_OUT";
}

// for some contracts it's not possible to get LP token address or coin count
// from pool contract, so static mapping is defined here
export class PoolStaticInfo {
  poolAddress: string;
  lpTokenAddress: string;
  coinCount: i32;
  poolType: string;
  isUsingOldApi: boolean;
  rewardTokens: string[];

  constructor(
    poolAddress: string,
    lpTokenAddress: string,
    coinCount: i32,
    poolType: string,
    isUsingOldApi: boolean,
    rewardTokens: string[]
  ) {
    this.poolAddress = poolAddress;
    this.lpTokenAddress = lpTokenAddress;
    this.coinCount = coinCount;
    this.poolType = poolType;
    this.isUsingOldApi = isUsingOldApi;
    this.rewardTokens = rewardTokens;
  }
}

// use lower case!
export const Y_POOL = "0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51";
export const Y_LP_TOKEN = "0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8";
export const SUSD_POOL = "0xa5407eae9ba41422680e2e00537571bcc53efbfd";
export const SUSD_LP_TOKEN = "0xc25a3a3b969415c80451098fa907ec722572917f";
export const BUSD_POOL = "0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27";
export const BUSD_LP_TOKEN = "0x3b3ac5386837dc563660fb6a0937dfaa5924333b";
export const PAX_POOL = "0x06364f10b501e868329afbc005b3492902d6c763";
export const PAX_LP_TOKEN = "0xd905e2eaebe188fc92179b6350807d8bd91db0d8";
export const COMPOUND_POOL = "0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56";
export const COMPOUND_LP_TOKEN = "0x845838df265dcd2c412a1dc9e959c7d08537f8a2";
export const IRONBANK_POOL = "0x2dded6da1bf5dbdf597c45fcfaa3194e53ecfeaf";
export const IRONBANK_LP_TOKEN = "0x5282a4ef67d9c33135340fb3289cc1711c13638c";

export let addressToPool = new TypedMap<string, PoolStaticInfo>();
addressToPool.set(Y_POOL, new PoolStaticInfo(Y_POOL, Y_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(SUSD_POOL, new PoolStaticInfo(SUSD_POOL, SUSD_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(BUSD_POOL, new PoolStaticInfo(BUSD_POOL, BUSD_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(PAX_POOL, new PoolStaticInfo(PAX_POOL, PAX_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(
  COMPOUND_POOL,
  new PoolStaticInfo(COMPOUND_POOL, COMPOUND_LP_TOKEN, 2, "LENDING", true, [])
);
addressToPool.set(
  IRONBANK_POOL,
  new PoolStaticInfo(IRONBANK_POOL, IRONBANK_LP_TOKEN, 3, "LENDING", false, [])
);

export let lpTokenToPool = new TypedMap<string, string>();
lpTokenToPool.set(Y_LP_TOKEN, Y_POOL);
lpTokenToPool.set(SUSD_LP_TOKEN, SUSD_POOL);
lpTokenToPool.set(BUSD_LP_TOKEN, BUSD_POOL);
lpTokenToPool.set(PAX_LP_TOKEN, PAX_POOL);
lpTokenToPool.set(COMPOUND_LP_TOKEN, COMPOUND_POOL);
lpTokenToPool.set(IRONBANK_LP_TOKEN, IRONBANK_POOL);
