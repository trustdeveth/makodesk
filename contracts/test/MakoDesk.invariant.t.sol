// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MakoDesk} from "../src/MakoDesk.sol";
import {MakoToken} from "../src/MakoToken.sol";
import {IHyperCoreData} from "../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter} from "../src/interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "../src/interfaces/IBuybackRouter.sol";
import {MockCoreData, MockOrderRouter, MockSwapRouter} from "./mocks/Mocks.sol";

/// Drives the desk through random sequences of market moves, fills, settlements and burns.
contract DeskHandler is Test {
    MakoDesk public desk;
    MockCoreData public feed;
    MockOrderRouter public router;
    address public keeper;
    address public guardian;

    uint64 public coreBlk = 1_000;
    uint256 public bn = 100;
    uint256 public ts = 1_800_000_000;
    uint256 public fills;
    uint256 public sumPositiveSettledProfitE6; // upper bound for every budget ever granted
    uint256 public maxObservedQuoteRoomViolation;

    constructor(MakoDesk d, MockCoreData f, MockOrderRouter r, address k, address g) {
        desk = d;
        feed = f;
        router = r;
        keeper = k;
        guardian = g;
    }

    function _advance(uint256 secs) internal {
        bn++;
        ts += secs;
        vm.roll(bn);
        vm.warp(ts);
    }

    function poke(uint256 midSeed, int256 funding, uint256 liq, int256 pos, uint8 lag) external {
        coreBlk += 2;
        uint256 mid = bound(midSeed, 20e8, 60e8);
        funding = bound(funding, -200_000_000, 200_000_000);
        liq = bound(liq, 0, 5_000_000e6);
        pos = bound(pos, -3_000e8, 3_000e8);
        feed.set(coreBlk, mid, funding, liq);
        feed.setPos(pos);
        if (lag % 7 == 0) feed.setLatest(coreBlk + 20); // sometimes stale
        _advance(1 + (lag % 30));
        desk.poke();
        // check the cap property against the position used for quoting
        int256 maxPos = 2_500e8;
        uint128 b = desk.activeBidCloid();
        uint128 a = desk.activeAskCloid();
        if (b != 0 && pos + int256(router.order(b).sz) > maxPos) maxObservedQuoteRoomViolation++;
        if (a != 0 && pos - int256(router.order(a).sz) < -maxPos) maxObservedQuoteRoomViolation++;
    }

    function fill(bool isBuy, uint256 px, uint256 sz, uint256 fee) external {
        px = bound(px, 20e8, 60e8);
        sz = bound(sz, 1e6, 100e8);
        fee = bound(fee, 0, 5e6);
        router.fill(address(desk), keccak256(abi.encode(fills++)), isBuy, px, sz, fee);
    }

    function moveEquity(int256 delta) external {
        delta = bound(delta, -8_000e6, 8_000e6);
        int256 e = feed.equity() + delta;
        if (e < 1_000e6) e = 1_000e6;
        feed.setEquity(e);
    }

    function settle() external {
        _advance(1 days);
        int256 realizedDelta = desk.realizedPnlE6() - desk.realizedAtEpochStartE6();
        int256 eqStart = desk.epochStartEquityE6();
        int256 eqDelta = feed.equity() - (eqStart == 0 ? feed.equity() : eqStart);
        int256 profit = realizedDelta < eqDelta ? realizedDelta : eqDelta;
        desk.settle();
        if (profit > 0) sumPositiveSettledProfitE6 += uint256(profit);
    }

    function buyback(uint256 hype) external {
        hype = bound(hype, 1, 3 ether);
        vm.deal(keeper, hype);
        vm.startPrank(keeper);
        desk.depositForBurn{value: hype}();
        try desk.buybackAndBurn(hype, 0, block.timestamp + 60) {} catch {}
        vm.stopPrank();
    }

    function guardianKill() external {
        vm.prank(guardian);
        desk.kill("FUZZ");
    }
}

contract MakoDeskInvariantTest is Test {
    MakoDesk desk;
    MockCoreData feed;
    MockOrderRouter router;
    MakoToken mako;
    DeskHandler h;
    uint256 burnedAtStart;

    function setUp() public {
        vm.warp(1_800_000_000);
        mako = new MakoToken(address(this));
        feed = new MockCoreData();
        router = new MockOrderRouter();
        MockSwapRouter swap = new MockSwapRouter(address(0xbA876237B0F021A6c6D852d6c26E107997cC5E81), mako, 9_000e18);
        mako.transfer(address(swap), 500_000_000 ether);
        address keeper = makeAddr("keeper");
        address guardian = makeAddr("guardian");
        desk = new MakoDesk(
            makeAddr("timelock"),
            mako,
            159,
            IHyperCoreData(address(feed)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            makeAddr("core"),
            guardian,
            keeper,
            MakoDesk.Params({
                maxPositionSzE8: 2_500e8,
                quoteSzE8: 50e8,
                maxDailyLossE6: 4_000e6,
                maxDrawdownBps: 1_500,
                skewBandBps: 4_000,
                burnShareBps: 8_000,
                wickDropBps: 150,
                maxStaleBlocks: 11,
                wickWindowBlocks: 30,
                breachHoldBlocks: 600,
                wickLiqE6: 1_000_000e6,
                epochLength: 1 days,
                minTipInterval: 10,
                pokeTip: 0.0005 ether
            })
        );
        feed.set(1_000, 38e8, 0, 0);
        feed.setEquity(100_000e6);
        vm.prank(makeAddr("timelock"));
        desk.resume();
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(desk).call{value: 5 ether}("");
        require(ok);
        h = new DeskHandler(desk, feed, router, keeper, guardian);
        targetContract(address(h));
        burnedAtStart = mako.balanceOf(desk.DEAD());
    }

    /// Burn budget is only ever granted from realized-and-held profit.
    function invariant_BudgetNeverExceedsProfit() public view {
        assertLe(desk.burnBudgetE6(), h.sumPositiveSettledProfitE6());
        assertLe(desk.withdrawableProfitE6(), h.sumPositiveSettledProfitE6());
    }

    /// Earmarked HYPE and the tip pool are always fully backed by the contract balance.
    function invariant_HypeAccountingBacked() public view {
        assertGe(address(desk).balance, desk.tipPool() + desk.burnHype());
    }

    /// A killed or paused desk never has quotes resting.
    function invariant_NoQuotesWhenHalted() public view {
        if (desk.paused()) {
            assertEq(desk.activeBidCloid(), 0);
            assertEq(desk.activeAskCloid(), 0);
        }
    }

    /// Quotes never offer more than the room left under the position cap.
    function invariant_QuotesRespectCap() public view {
        assertEq(h.maxObservedQuoteRoomViolation(), 0);
    }

    /// Everything counted as burned really sits at the burn address.
    function invariant_TotalBurnedMatchesDeadBalance() public view {
        assertEq(desk.totalBurned(), mako.balanceOf(desk.DEAD()) - burnedAtStart);
    }
}
