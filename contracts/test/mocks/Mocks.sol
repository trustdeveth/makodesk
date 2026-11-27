// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHyperCoreData} from "../../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter, ICoreFillReceiver} from "../../src/interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "../../src/interfaces/IBuybackRouter.sol";

contract MockCoreData is IHyperCoreData {
    Snapshot internal s;
    uint64 public latest;
    int256 public equity;
    int256 public pos;

    function set(uint64 blk, uint256 mid, int256 funding, uint256 liq) public {
        s = Snapshot({
            coreBlock: blk,
            coreTimeMs: blk * 70,
            midE8: mid,
            bestBidE8: mid - mid / 100_000,
            bestAskE8: mid + mid / 100_000,
            fundingE8: funding,
            liqNotionalE6: liq
        });
        if (blk > latest) latest = blk;
    }

    function setLatest(uint64 b) external {
        latest = b;
    }

    function setEquity(int256 e) external {
        equity = e;
    }

    function setPos(int256 p) external {
        pos = p;
    }

    function snapshot(uint32) external view returns (Snapshot memory) {
        return s;
    }

    function latestCoreBlock() external view returns (uint64) {
        return latest;
    }

    function accountValueE6(address) external view returns (int256) {
        return equity;
    }

    function positionSzE8(address, uint32) external view returns (int256) {
        return pos;
    }
}

contract MockOrderRouter is ICoreOrderRouter {
    struct Order {
        bool isBuy;
        uint256 px;
        uint256 sz;
        bool postOnly;
        uint128 cloid;
        bool live;
    }

    mapping(uint128 => Order) public orders;
    uint128[] public placed;
    uint256 public nonce;
    uint256 public cancels;

    function placeLimit(uint32, bool isBuy, uint256 pxE8, uint256 szE8, bool postOnly, uint128 cloid)
        external
        returns (uint256)
    {
        orders[cloid] = Order(isBuy, pxE8, szE8, postOnly, cloid, true);
        placed.push(cloid);
        return ++nonce;
    }

    function cancelByCloid(uint32, uint128 cloid) external returns (uint256) {
        orders[cloid].live = false;
        cancels++;
        return ++nonce;
    }

    function liveCount() external view returns (uint256 n) {
        for (uint256 i = 0; i < placed.length; i++) {
            if (orders[placed[i]].live) n++;
        }
    }

    function order(uint128 cloid) external view returns (Order memory) {
        return orders[cloid];
    }

    /// simulate the keeper delivering a fill outcome
    function fill(address desk, bytes32 id, bool isBuy, uint256 px, uint256 sz, uint256 fee) external {
        ICoreFillReceiver(desk).onFill(id, 0, isBuy, px, sz, fee, 1);
    }
}

/// V2-style router: pays out MAKO from its own balance at a fixed rate (MAKO per HYPE, 18 dp).
contract MockSwapRouter is IBuybackRouter {
    address public immutable WETH;
    IERC20 public immutable token;
    uint256 public rate;

    constructor(address weth, IERC20 token_, uint256 rate_) {
        WETH = weth;
        token = token_;
        rate = rate_;
    }

    function setRate(uint256 r) external {
        rate = r;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata) external view returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = amountIn;
        a[1] = (amountIn * rate) / 1e18;
    }

    function buy(address tok, address to, uint256 minOut, uint256 deadline) external payable {
        require(block.timestamp <= deadline, "EXPIRED");
        require(tok == address(token), "TOKEN");
        uint256 out = (msg.value * rate) / 1e18;
        require(out >= minOut, "SLIPPAGE");
        token.transfer(to, out);
    }

    function quote(address, uint256 amountIn) external view returns (uint256) {
        return (amountIn * rate) / 1e18;
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 minOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        require(block.timestamp <= deadline, "EXPIRED");
        require(path.length == 2 && path[0] == WETH && path[1] == address(token), "PATH");
        uint256 out = (msg.value * rate) / 1e18;
        require(out >= minOut, "SLIPPAGE");
        token.transfer(to, out);
    }
}
