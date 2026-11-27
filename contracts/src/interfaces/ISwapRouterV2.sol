// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Uniswap-V2-style router used for buyback. The official MAKO/HYPE pool's
///         router is configured at deploy (and changeable only through the timelock).
interface ISwapRouterV2 {
    function WETH() external view returns (address);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}
