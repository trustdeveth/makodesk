// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UniswapV4BuybackRouter, IPoolManagerV4} from "../../src/adapters/UniswapV4BuybackRouter.sol";

/// Fork test against the live $MAKO Montra pool on Elysium mainnet.
///   FORK_URL=https://rpc.elysium.kinetiq.xyz forge test --mc UniswapV4BuybackForkTest -vv
contract UniswapV4BuybackForkTest is Test {
    address constant MANAGER = 0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1;
    address constant MAKO = 0xBF74a922615CaF3F1E8C803851557d2d5F3172E8;
    address constant HOOK = 0x6b1216A40B65c83e9c9e18a562C446697B8cf8EC;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    UniswapV4BuybackRouter r;
    bool noFork;

    function setUp() public {
        string memory url = vm.envOr("FORK_URL", string(""));
        if (bytes(url).length == 0) {
            noFork = true;
            return;
        }
        vm.createSelectFork(url);
        r = new UniswapV4BuybackRouter(IPoolManagerV4(MANAGER), MAKO, 0x800000, 200, HOOK);
    }

    function test_QuoteAndBuyToDead() public {
        if (noFork) return;
        uint256 q = r.quote(MAKO, 0.01 ether);
        emit log_named_uint("quote MAKO for 0.01 HYPE", q);
        assertGt(q, 0);

        address desk = makeAddr("desk");
        vm.deal(desk, 1 ether);
        uint256 before = IERC20(MAKO).balanceOf(DEAD);
        vm.prank(desk);
        r.buy{value: 0.01 ether}(MAKO, DEAD, (q * 99) / 100, block.timestamp + 60);
        uint256 got = IERC20(MAKO).balanceOf(DEAD) - before;
        emit log_named_uint("MAKO burned", got);
        assertGe(got, (q * 99) / 100);
        assertEq(address(r).balance, 0, "router keeps nothing");
        assertEq(IERC20(MAKO).balanceOf(address(r)), 0);
        assertEq(desk.balance, 1 ether - 0.01 ether, "exactly amountIn spent");
    }

    function test_SlippageAndWrongToken() public {
        if (noFork) return;
        uint256 q = r.quote(MAKO, 0.01 ether);
        vm.deal(address(this), 1 ether);
        vm.expectRevert();
        r.buy{value: 0.01 ether}(MAKO, DEAD, q * 2, block.timestamp + 60);
        vm.expectRevert(UniswapV4BuybackRouter.WrongToken.selector);
        r.buy{value: 0.01 ether}(address(1), DEAD, 0, block.timestamp + 60);
    }
}
