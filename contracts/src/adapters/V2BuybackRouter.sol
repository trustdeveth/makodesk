// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuybackRouter} from "../interfaces/IBuybackRouter.sol";
import {ISwapRouterV2} from "../interfaces/ISwapRouterV2.sol";

interface IV2Quoter {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
}

/// @notice IBuybackRouter over a Uniswap-V2-style router (WHYPE -> token).
contract V2BuybackRouter is IBuybackRouter {
    ISwapRouterV2 public immutable v2;

    constructor(ISwapRouterV2 v2_) {
        v2 = v2_;
    }

    function _path(address token) internal view returns (address[] memory p) {
        p = new address[](2);
        p[0] = v2.WETH();
        p[1] = token;
    }

    function buy(address token, address to, uint256 minOut, uint256 deadline) external payable {
        v2.swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(minOut, _path(token), to, deadline);
    }

    function quote(address token, uint256 amountIn) external view returns (uint256) {
        return IV2Quoter(address(v2)).getAmountsOut(amountIn, _path(token))[1];
    }
}
