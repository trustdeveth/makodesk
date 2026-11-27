// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHyperCoreData} from "../interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter, ICoreFillReceiver} from "../interfaces/ICoreOrderRouter.sol";

/*
 * ============================================================================
 *  WIRING POINT FOR ELYSIUM'S ARBOS UPGRADE (Phase 2 / Phase 3)
 * ============================================================================
 *  As of 2026-11-27 Kinetiq has documented WHAT the HyperCore market-data precompile
 *  and the ElysiumCoreWriter predeploy do, but not their addresses or ABIs:
 *    - precompile: order books (BBO to full depth), oracle/mark/spot prices, balances,
 *      positions, aggregates; each response stamped with HyperCore block height + time;
 *      data is sequencer-attested. (elysium.kinetiq.xyz/docs/hypercore-market-data)
 *    - ElysiumCoreWriter: contract binds a HyperCore account + registrar, the account
 *      approves a trade-only agent, the contract emits order intents, a keeper signs and
 *      submits them (~100 ms); outcomes return via opt-in callbacks paid from a HYPE gas
 *      escrow; no atomicity, dedupe by intent nonce.
 *      (elysium.kinetiq.xyz/docs/trading-on-hypercore-from-elysium)
 *
 *  These adapters are deliberately NOT guessing the encoding. Every function reverts
 *  with NotWired() until the published ABI is filled in, so nothing can be deployed
 *  against an assumed interface by accident. MakoDesk never needs to change: it only
 *  sees IHyperCoreData / ICoreOrderRouter.
 *
 *  To wire, once Kinetiq publishes:
 *    1. Add the official interface files next to this one.
 *    2. Implement each function below (unit conversion notes inline).
 *    3. Add fork tests in test/fork/ against an Elysium RPC.
 *    4. Re-run the full suite + external audit before the desk holds capital.
 * ============================================================================
 */

error NotWired();

/// @notice Translates the HyperCore market-data precompile into IHyperCoreData.
contract ElysiumMarketDataAdapter is IHyperCoreData {
    address public immutable precompile;

    constructor(address precompile_) {
        precompile = precompile_;
    }

    /// @dev Map: BBO/full-depth read -> bestBid/bestAsk/mid (convert HyperCore px to E8),
    ///      funding from the perp asset context (hourly rate -> E8 where 1e8 = 1%),
    ///      liquidation notional from the aggregates read, coreBlock/coreTimeMs from the
    ///      response stamp.
    function snapshot(uint32) external pure returns (Snapshot memory) {
        revert NotWired();
    }

    function latestCoreBlock() external pure returns (uint64) {
        revert NotWired();
    }

    /// @dev Account value from the account margin summary (USD -> E6).
    function accountValueE6(address) external pure returns (int256) {
        revert NotWired();
    }

    /// @dev Position size (HyperCore szi, szDecimals) -> E8.
    function positionSzE8(address, uint32) external pure returns (int256) {
        revert NotWired();
    }
}

/// @notice Translates ICoreOrderRouter into ElysiumCoreWriter intents and relays fills.
/// @dev Must be the address the predeploy calls back; it forwards outcomes to the desk.
contract ElysiumCoreWriterAdapter is ICoreOrderRouter {
    address public immutable predeploy;
    address public immutable desk;

    constructor(address predeploy_, address desk_) {
        predeploy = predeploy_;
        desk = desk_;
    }

    /// @dev Convert pxE8 to a valid HyperCore price (tick size / 5 significant figures),
    ///      szE8 to szDecimals, postOnly -> ALO time-in-force, then emit the intent.
    function placeLimit(uint32, bool, uint256, uint256, bool, uint128) external pure returns (uint256) {
        revert NotWired();
    }

    function cancelByCloid(uint32, uint128) external pure returns (uint256) {
        revert NotWired();
    }

    /// @dev Callback entry from the predeploy: verify msg.sender == predeploy, decode the
    ///      outcome, derive a unique fillId (intent nonce + fill index), then call
    ///      ICoreFillReceiver(desk).onFill(...). The desk dedupes by fillId.
    function onOutcome(bytes calldata) external pure {
        revert NotWired();
    }

    // silence "unused" warnings for the documented forwarding target
    function _target() internal view returns (ICoreFillReceiver) {
        return ICoreFillReceiver(desk);
    }
}
