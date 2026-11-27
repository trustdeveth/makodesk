// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHyperCoreData
/// @notice Normalised view of Elysium's HyperCore market-data precompile.
/// @dev Kinetiq has not published the precompile address or ABI yet. MakoDesk only talks
///      to this interface; `ElysiumMarketDataAdapter` translates it to the real precompile
///      once the ArbOS upgrade ships. All prices are USD with 8 decimals (E8), sizes are
///      base units with 8 decimals, USD amounts are 6 decimals (E6).
interface IHyperCoreData {
    struct Snapshot {
        uint64 coreBlock; // HyperCore block the data was derived from
        uint64 coreTimeMs; // HyperCore block timestamp (ms)
        uint256 midE8; // (best bid + best ask) / 2
        uint256 bestBidE8;
        uint256 bestAskE8;
        int256 fundingE8; // current 1h funding rate, 1e8 = 1%
        uint256 liqNotionalE6; // liquidation notional over the precompile's recent window
    }

    /// @notice Latest market snapshot for a HyperCore perp asset.
    function snapshot(uint32 asset) external view returns (Snapshot memory);

    /// @notice Most recent HyperCore block known to the chain (used for staleness checks).
    function latestCoreBlock() external view returns (uint64);

    /// @notice Account value (collateral + unrealized PnL) of a HyperCore account, USD E6.
    function accountValueE6(address account) external view returns (int256);

    /// @notice Signed position size of `account` in `asset`, base units E8.
    function positionSzE8(address account, uint32 asset) external view returns (int256);
}
