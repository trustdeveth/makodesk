// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBuybackRouter
/// @notice Venue-agnostic "buy token with native HYPE" adapter used by MakoDesk's buyback.
/// @dev $MAKO launches on Montra (Uniswap v4 pools on Elysium), so the desk does not hard-code
///      a router. Implementations: `V2BuybackRouter` (V2-style routers) and a Uniswap v4
///      adapter for the Montra pool, configured through the timelock once the token's pool
///      key is known. The desk measures what actually arrives at `to`, so an adapter cannot
///      over-report.
interface IBuybackRouter {
    /// @notice Spend all of msg.value buying `token`, delivering at least `minOut` to `to`.
    function buy(address token, address to, uint256 minOut, uint256 deadline) external payable;

    /// @notice Expected output for `amountIn` HYPE (may be non-view, e.g. a v4 quoter; call it via eth_call).
    function quote(address token, uint256 amountIn) external returns (uint256);
}
