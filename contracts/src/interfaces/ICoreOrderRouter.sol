// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICoreOrderRouter
/// @notice Normalised view of ElysiumCoreWriter (the HyperCore order-intent predeploy).
/// @dev Per Kinetiq's docs the predeploy emits order *intents* that a keeper signs as the
///      desk's trade-only agent and submits to HyperCore (~100 ms). Elysium and HyperCore
///      are not atomic: a placed intent may never rest or fill. Outcomes come back through
///      the opt-in callback below, deduplicated by fill id. The real ABI is unpublished;
///      `ElysiumCoreWriterAdapter` maps this interface onto it.
interface ICoreOrderRouter {
    /// @notice Emit a resting limit-order intent. `postOnly` = add-liquidity-only (ALO).
    /// @return nonce Intent nonce assigned by the predeploy.
    function placeLimit(uint32 asset, bool isBuy, uint256 pxE8, uint256 szE8, bool postOnly, uint128 cloid)
        external
        returns (uint256 nonce);

    /// @notice Emit a cancel intent for a client order id.
    function cancelByCloid(uint32 asset, uint128 cloid) external returns (uint256 nonce);
}

/// @notice Fill callback implemented by MakoDesk; only the router may call it.
interface ICoreFillReceiver {
    function onFill(
        bytes32 fillId,
        uint128 cloid,
        bool isBuy,
        uint256 pxE8,
        uint256 szE8,
        uint256 feeE6,
        uint64 coreBlock
    ) external;
}
