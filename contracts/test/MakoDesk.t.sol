// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {MakoDesk} from "../src/MakoDesk.sol";
import {MakoToken} from "../src/MakoToken.sol";
import {IMakoDesk} from "../src/interfaces/IMakoDesk.sol";
import {IHyperCoreData} from "../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter} from "../src/interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "../src/interfaces/IBuybackRouter.sol";
import {MockCoreData, MockOrderRouter, MockSwapRouter} from "./mocks/Mocks.sol";

contract MakoDeskTest is Test {
    MakoDesk desk;
    MakoToken mako;
    MockCoreData dataFeed;
    MockOrderRouter router;
    MockSwapRouter swap;

    address gov = makeAddr("gov"); // stands in for the timelock in unit tests
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address coreAcct = makeAddr("coreAccount");
    address alice = makeAddr("alice");
    address constant WHYPE = address(0xbA876237B0F021A6c6D852d6c26E107997cC5E81);

    uint256 constant MID = 38_42000000; // $38.42
    uint64 blk = 1_000;
    uint256 bn = 100; // explicit EVM block / time cursors (via-IR caches block.number reads in tests)
    uint256 ts = 1_800_000_000;

    function launchParams() internal pure returns (MakoDesk.Params memory) {
        return MakoDesk.Params({
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
        });
    }

    function setUp() public {
        vm.roll(bn);
        vm.warp(ts);
        mako = new MakoToken(address(this));
        dataFeed = new MockCoreData();
        router = new MockOrderRouter();
        swap = new MockSwapRouter(WHYPE, mako, 9_000e18); // 9,000 MAKO per HYPE
        mako.transfer(address(swap), 100_000_000 ether);
        desk = new MakoDesk(
            gov,
            mako,
            159,
            IHyperCoreData(address(dataFeed)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            coreAcct,
            guardian,
            keeper,
            launchParams()
        );
        dataFeed.set(blk, MID, 10_000_000, 0); // funding 0.10% -> Cruising
        dataFeed.setEquity(100_000e6);
        vm.prank(gov);
        desk.resume(); // desks deploy halted
    }

    /* ---------------- helpers ---------------- */
    function pokeAt(uint256 mid, int256 funding, uint256 liq) internal {
        blk += 2;
        dataFeed.set(blk, mid, funding, liq);
        vm.roll(++bn);
        ts = (block.timestamp > ts ? block.timestamp : ts) + 1;
        vm.warp(ts);
        vm.prank(alice);
        desk.poke();
    }

    function poke() internal {
        pokeAt(MID, 10_000_000, 0);
    }

    function lastQuotes() internal view returns (MockOrderRouter.Order memory bid, MockOrderRouter.Order memory ask) {
        bid = router.order(desk.activeBidCloid());
        ask = router.order(desk.activeAskCloid());
    }

    /* ---------------- Sense: mood ---------------- */
    function test_MoodFollowsFunding() public {
        int256[5] memory f = [int256(-50_000_000), -10_000_000, 30_000_000, 80_000_000, 130_000_000];
        IMakoDesk.Mood[5] memory want = [
            IMakoDesk.Mood.Feeding,
            IMakoDesk.Mood.Hunting,
            IMakoDesk.Mood.Cruising,
            IMakoDesk.Mood.Circling,
            IMakoDesk.Mood.Breach
        ];
        for (uint256 i = 0; i < 5; i++) {
            pokeAt(MID, f[i], 0);
            assertEq(uint8(desk.mood()), uint8(want[i]));
        }
        IMakoDesk.DeskState memory s = desk.state();
        assertEq(s.fundingE8, 130_000_000);
        assertEq(s.midPriceE8, MID);
        assertEq(s.coreBlock, blk);
    }

    function test_MoodBoundariesExact() public {
        pokeAt(MID, -40_000_000, 0); // exactly -0.40% is Hunting
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Hunting));
        pokeAt(MID, 0, 0); // exactly 0 is Cruising
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Cruising));
        pokeAt(MID, 120_000_000, 0); // exactly 1.20% is Breach
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Breach));
    }

    /* ---------------- Quote ---------------- */
    function test_QuotesAroundMidWithMoodSpread() public {
        poke(); // Cruising: 3 bps full spread
        (MockOrderRouter.Order memory b, MockOrderRouter.Order memory a) = lastQuotes();
        assertEq(b.px, (MID * (100_000 - 15)) / 100_000);
        assertEq(a.px, (MID * (100_000 + 15)) / 100_000);
        assertEq(b.sz, 50e8);
        assertEq(a.sz, 50e8);
        assertTrue(b.isBuy && !a.isBuy && b.postOnly && a.postOnly && b.live && a.live);

        pokeAt(MID, 80_000_000, 0); // Circling: 6 bps
        (b, a) = lastQuotes();
        assertEq(b.px, (MID * (100_000 - 30)) / 100_000);
        assertEq(a.px, (MID * (100_000 + 30)) / 100_000);
    }

    function test_RequoteCancelsPrevious() public {
        poke();
        poke();
        poke();
        assertEq(router.liveCount(), 2);
        assertEq(router.cancels(), 4);
    }

    function test_OnePokePerBlock() public {
        poke();
        vm.expectRevert(MakoDesk.AlreadyPoked.selector);
        desk.poke();
    }

    function test_StaleDataCancelsAndWaits() public {
        poke();
        assertEq(router.liveCount(), 2);
        vm.deal(address(desk), 1 ether);
        uint256 tipsBefore = desk.tipPool();
        dataFeed.setLatest(blk + 12); // > 11 core blocks behind (~750 ms)
        vm.roll(++bn);
        vm.warp(block.timestamp + 60);
        desk.poke();
        assertEq(router.liveCount(), 0);
        assertEq(desk.activeBidCloid(), 0);
        assertEq(desk.tipPool(), tipsBefore, "stale pokes are not tipped");
    }

    function test_CrossedBookIsTreatedAsStale() public {
        poke();
        // a snapshot with bid >= ask is invalid data
        MockCoreData d = dataFeed;
        d.set(blk + 1, 0, 0, 0);
        vm.roll(++bn);
        desk.poke();
        assertEq(router.liveCount(), 0);
    }

    /* ---------------- Risk: caps & skew ---------------- */
    function test_PositionCapTrimsAndBlocksSide() public {
        dataFeed.setPos(2_480e8);
        poke();
        (MockOrderRouter.Order memory b, MockOrderRouter.Order memory a) = lastQuotes();
        assertEq(b.sz, 20e8, "bid trimmed to remaining room");
        assertEq(a.sz, 50e8);

        dataFeed.setPos(2_500e8);
        poke();
        assertEq(desk.activeBidCloid(), 0, "no bid at the cap");
        assertTrue(desk.activeAskCloid() != 0);

        dataFeed.setPos(-2_500e8);
        poke();
        assertEq(desk.activeAskCloid(), 0, "no ask at the short cap");
    }

    function test_InventoryLeanPastSkewBand() public {
        dataFeed.setPos(2_000e8); // 80% long, band is 40%
        poke();
        (MockOrderRouter.Order memory b, MockOrderRouter.Order memory a) = lastQuotes();
        uint256 symBid = (MID * (100_000 - 15)) / 100_000;
        uint256 symAsk = (MID * (100_000 + 15)) / 100_000;
        assertLt(b.px, symBid, "long inventory lowers the bid");
        assertLt(a.px, symAsk, "and the ask, to sell inventory");

        dataFeed.setPos(-2_000e8);
        poke();
        (b, a) = lastQuotes();
        assertGt(b.px, symBid);
        assertGt(a.px, symAsk);

        dataFeed.setPos(500e8); // 20%: inside the band, symmetric
        poke();
        (b, a) = lastQuotes();
        assertEq(b.px, symBid);
        assertEq(a.px, symAsk);
    }

    function testFuzz_QuotesNeverBreachPositionCap(int256 pos) public {
        pos = bound(pos, -3_000e8, 3_000e8);
        dataFeed.setPos(pos);
        poke();
        int256 maxPos = 2_500e8;
        if (desk.activeBidCloid() != 0) assertLe(pos + int256(router.order(desk.activeBidCloid()).sz), maxPos);
        if (desk.activeAskCloid() != 0) assertGe(pos - int256(router.order(desk.activeAskCloid()).sz), -maxPos);
    }

    /* ---------------- Fills ---------------- */
    function test_FillAccountingRoundTrip() public {
        poke();
        router.fill(address(desk), "f1", true, 38_00000000, 10e8, 1e6); // buy 10 @ 38, $1 fee
        router.fill(address(desk), "f2", false, 39_00000000, 10e8, 1e6); // sell 10 @ 39, $1 fee
        assertEq(desk.positionSzE8(), 0);
        assertEq(desk.realizedPnlE6(), 10e6 - 2e6);
        // duplicate delivery is ignored
        router.fill(address(desk), "f2", false, 39_00000000, 10e8, 1e6);
        assertEq(desk.realizedPnlE6(), 8e6);
    }

    function test_FillAccountingFlipAndAverage() public {
        router.fill(address(desk), "a", true, 40_00000000, 10e8, 0);
        router.fill(address(desk), "b", true, 42_00000000, 10e8, 0); // avg 41
        assertEq(desk.avgEntryE8(), 41_00000000);
        router.fill(address(desk), "c", false, 43_00000000, 30e8, 0); // close 20 (+$40), open short 10 @ 43
        assertEq(desk.realizedPnlE6(), 40e6);
        assertEq(desk.positionSzE8(), -10e8);
        assertEq(desk.avgEntryE8(), 43_00000000);
        router.fill(address(desk), "d", true, 44_00000000, 10e8, 0); // short loses $10
        assertEq(desk.realizedPnlE6(), 30e6);
        assertEq(desk.positionSzE8(), 0);
    }

    function test_EdgeIsMeasuredAgainstQuoteMid() public {
        vm.recordLogs();
        router.fill(address(desk), "pre", true, 38_00000000, 10e8, 1e6); // before any quote: edge = -fee
        poke(); // quotes around $38.42
        router.fill(address(desk), "post", true, 38_40000000, 10e8, 0); // bought $0.02 under mid: +$0.20
        bytes32 topic = keccak256("Filled(uint64,bool,uint256,uint256,int256)");
        int256[] memory edges = new int256[](2);
        uint256 n;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == topic) {
                (,,, edges[n++]) = abi.decode(logs[i].data, (bool, uint256, uint256, int256));
            }
        }
        assertEq(n, 2);
        assertEq(edges[0], -1e6);
        assertEq(edges[1], 0.2e6);
    }

    function test_OnlyRouterCanReportFills() public {
        vm.expectRevert(MakoDesk.NotRouter.selector);
        desk.onFill("x", 0, true, 1, 1, 0, 1);
    }

    /* ---------------- Risk: daily loss & drawdown ---------------- */
    function test_DailyLossPausesUntilNextUtcDay() public {
        poke(); // day baseline = 100,000
        dataFeed.setEquity(95_900e6); // -$4,100
        poke();
        assertTrue(desk.paused());
        assertEq(router.liveCount(), 0);
        assertFalse(desk.killed());

        poke(); // still paused, nothing quoted
        assertEq(router.liveCount(), 0);

        vm.warp((block.timestamp / 1 days + 1) * 1 days + 60); // next UTC day
        poke();
        assertFalse(desk.paused());
        assertEq(router.liveCount(), 2);
    }

    function test_DrawdownKillsAndNeedsTimelockedResume() public {
        poke();
        dataFeed.setEquity(130_000e6);
        vm.warp(block.timestamp + 2 days); // new day so the daily-loss rule doesn't fire first
        poke(); // hwm 130k
        vm.warp(block.timestamp + 2 days);
        poke(); // new day baseline 130k
        dataFeed.setEquity(110_000e6); // -15.4% from hwm
        vm.warp(block.timestamp + 1 days);
        poke();
        assertTrue(desk.killed());
        assertEq(router.liveCount(), 0);

        vm.prank(alice);
        vm.expectRevert();
        desk.resume();

        vm.prank(gov);
        desk.resume();
        assertFalse(desk.killed());
        poke();
        assertEq(router.liveCount(), 2);
    }

    function test_PublicKillOnlyOnProvableBreach() public {
        poke();
        vm.prank(alice);
        vm.expectRevert(MakoDesk.NotAllowed.selector);
        desk.kill("no reason");

        dataFeed.setPos(2_600e8); // over the cap
        vm.prank(alice);
        desk.kill("POSITION_CAP");
        assertTrue(desk.killed());
        assertEq(router.liveCount(), 0);
    }

    function test_PublicKillOnStaleWithLiveQuotes() public {
        poke();
        dataFeed.setLatest(blk + 50);
        assertTrue(desk.provableBreach());
        vm.prank(alice);
        desk.kill("STALE");
        assertTrue(desk.killed());
    }

    function test_GuardianCanAlwaysKill() public {
        poke();
        vm.prank(guardian);
        desk.kill("MANUAL");
        assertTrue(desk.killed());
        poke();
        assertEq(router.liveCount(), 0, "killed desk never quotes");
    }

    /* ---------------- Wick detector ---------------- */
    function test_WickWithLiquidationsTriggersBreachBidOnly() public {
        pokeAt(MID, 10_000_000, 0);
        pokeAt((MID * 995) / 1000, 10_000_000, 0);
        pokeAt((MID * 980) / 1000, 10_000_000, 2_000_000e6); // -2% inside window, $2M liquidated
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Breach));
        assertTrue(desk.wickArmed());
        assertTrue(desk.activeBidCloid() != 0);
        assertEq(desk.activeAskCloid(), 0, "breach buys the flush");
        (MockOrderRouter.Order memory b,) = lastQuotes();
        uint256 mid = (MID * 980) / 1000;
        assertEq(b.px, (mid * (100_000 - 60)) / 100_000, "12 bps breach spread");

        // breach holds for breachHoldBlocks, then mood returns to funding-based
        blk += 700;
        pokeAt(mid, 10_000_000, 0);
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Cruising));
    }

    function test_DropWithoutLiquidationsIsNotAWick() public {
        pokeAt(MID, 10_000_000, 0);
        pokeAt((MID * 980) / 1000, 10_000_000, 10e6);
        assertEq(uint8(desk.mood()), uint8(IMakoDesk.Mood.Cruising));
        assertFalse(desk.wickArmed());
    }

    function test_SlowDropOutsideWindowIsNotAWick() public {
        pokeAt(MID, 10_000_000, 0);
        blk += 100; // beyond the 30-block window
        pokeAt((MID * 980) / 1000, 10_000_000, 2_000_000e6);
        assertFalse(desk.wickArmed());
    }

    /* ---------------- Settle ---------------- */
    function _profit(int256 realizedE6, int256 equityDeltaE6) internal {
        poke(); // sets epoch equity baseline (100k)
        if (realizedE6 > 0) {
            router.fill(address(desk), keccak256(abi.encode("o", realizedE6)), true, 40_00000000, 100e8, 0);
            router.fill(
                address(desk),
                keccak256(abi.encode("c", realizedE6)),
                false,
                40_00000000 + uint256(realizedE6),
                100e8,
                0
            );
        }
        dataFeed.setEquity(100_000e6 + equityDeltaE6);
        vm.warp(block.timestamp + 1 days);
    }

    function test_SettleBurnsEightyPercentOfProfit() public {
        _profit(100e6, 100e6); // +$100 realized and in equity
        assertEq(desk.realizedPnlE6(), 100e6);
        desk.settle();
        assertEq(desk.burnBudgetE6(), 80e6);
        assertEq(desk.epoch(), 1);
        assertEq(desk.pendingBurnReason(), bytes32("Desk profit"));
    }

    function test_SettleUsesLowerOfRealizedAndEquity() public {
        _profit(100e6, 30e6); // funding/unrealized ate most of it
        desk.settle();
        assertEq(desk.burnBudgetE6(), 24e6);
    }

    function test_LosingEpochBurnsNothing() public {
        _profit(100e6, -500e6);
        desk.settle();
        assertEq(desk.burnBudgetE6(), 0);
    }

    function test_WickBonusDoublesButNeverExceedsProfit() public {
        _profit(100e6, 100e6);
        pokeAt(MID, 10_000_000, 0);
        pokeAt((MID * 980) / 1000, 10_000_000, 2_000_000e6);
        assertTrue(desk.wickArmed());
        desk.settle();
        assertEq(desk.burnBudgetE6(), 100e6, "80% x 2.0 = 160%, capped at 100% of profit");
        assertEq(desk.pendingBurnReason(), bytes32("Wick bonus"));
        assertFalse(desk.wickArmed());
    }

    function test_SettleTooEarlyReverts() public {
        vm.expectRevert(MakoDesk.EpochNotOver.selector);
        desk.settle();
    }

    /* ---------------- Buyback & burn ---------------- */
    function test_BuybackAndBurn() public {
        _profit(100e6, 100e6);
        desk.settle(); // $80 budget
        vm.deal(keeper, 10 ether);
        vm.prank(keeper);
        desk.depositForBurn{value: 2 ether}();

        // 2 HYPE @ $38.42 = $76.84 <= $80
        uint256 deadBefore = mako.balanceOf(desk.DEAD());
        pokeAt(MID, 10_000_000, 0); // fresh data
        vm.prank(keeper);
        uint256 burned = desk.buybackAndBurn(2 ether, 18_000 ether, block.timestamp + 60);
        assertEq(burned, 18_000 ether);
        assertEq(mako.balanceOf(desk.DEAD()) - deadBefore, 18_000 ether);
        assertEq(desk.totalBurned(), 18_000 ether);
        assertEq(desk.state().totalBurned, 18_000 ether);
        assertEq(desk.burnBudgetE6(), 80e6 - 76_840000);
    }

    function test_BuybackRespectsBudgetRoleAndSlippage() public {
        _profit(100e6, 100e6);
        desk.settle();
        vm.deal(keeper, 10 ether);
        vm.prank(keeper);
        desk.depositForBurn{value: 5 ether}();
        pokeAt(MID, 10_000_000, 0);

        vm.prank(keeper);
        vm.expectRevert(MakoDesk.OverBudget.selector); // 3 HYPE = $115 > $80
        desk.buybackAndBurn(3 ether, 0, block.timestamp + 60);

        vm.prank(alice);
        vm.expectRevert(MakoDesk.NotKeeper.selector);
        desk.buybackAndBurn(1 ether, 0, block.timestamp + 60);

        vm.prank(keeper);
        vm.expectRevert(); // router enforces minOut
        desk.buybackAndBurn(1 ether, 10_000 ether, block.timestamp + 60);
    }

    function test_ProfitWithdrawalNoteIsBounded() public {
        _profit(100e6, 100e6);
        desk.settle();
        assertEq(desk.withdrawableProfitE6(), 80e6);
        vm.prank(keeper);
        vm.expectRevert(MakoDesk.OverBudget.selector);
        desk.noteProfitWithdrawal(81e6);
        vm.prank(keeper);
        desk.noteProfitWithdrawal(80e6);
        assertEq(desk.withdrawableProfitE6(), 0);
    }

    function test_WithdrawalDoesNotTriggerDailyLoss() public {
        _profit(5_000e6, 5_000e6);
        desk.settle(); // $4,000 budget
        poke(); // day baseline = 105k
        vm.prank(keeper);
        desk.noteProfitWithdrawal(4_000e6);
        dataFeed.setEquity(101_000e6); // treasury pulled $4k off HyperCore
        poke();
        assertFalse(desk.paused());
    }

    /* ---------------- Tips ---------------- */
    function test_TipsAtMostOncePerInterval() public {
        (bool ok,) = address(desk).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(desk.tipPool(), 1 ether);
        uint256 bal = alice.balance;
        poke();
        assertEq(alice.balance - bal, 0.0005 ether);
        poke(); // 1s later: inside minTipInterval
        assertEq(alice.balance - bal, 0.0005 ether);
        vm.warp(block.timestamp + 10);
        poke();
        assertEq(alice.balance - bal, 0.001 ether);
    }

    function test_TipsNeverSpendBurnFunds() public {
        vm.deal(keeper, 1 ether);
        vm.prank(keeper);
        desk.depositForBurn{value: 1 ether}();
        uint256 bal = alice.balance;
        poke();
        assertEq(alice.balance, bal, "empty tip pool pays nothing");
        assertEq(desk.burnHype(), 1 ether);
    }

    /* ---------------- Deploy-before-token lifecycle ---------------- */
    function test_DeploysHaltedWithoutTokenOrAdapters() public {
        MakoDesk d = new MakoDesk(
            gov,
            MakoToken(address(0)),
            159,
            IHyperCoreData(address(0)),
            ICoreOrderRouter(address(0)),
            IBuybackRouter(address(0)),
            address(0),
            guardian,
            keeper,
            launchParams()
        );
        assertTrue(d.killed());
        assertTrue(d.paused());
        assertEq(address(d.mako()), address(0));
        vm.expectRevert(); // no data adapter yet: poke cannot do anything
        d.poke();
        vm.prank(gov);
        vm.expectRevert(MakoDesk.NotWired.selector);
        d.resume();
        vm.prank(keeper);
        vm.expectRevert(MakoDesk.NotWired.selector);
        d.buybackAndBurn(1, 0, block.timestamp);

        // wire through governance, then resume
        vm.startPrank(gov);
        d.setAdapters(
            IHyperCoreData(address(dataFeed)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            coreAcct
        );
        d.resume();
        vm.stopPrank();
        assertFalse(d.killed());
    }

    function test_TokenIsSetOnceByOwner() public {
        MakoDesk d = new MakoDesk(
            gov,
            MakoToken(address(0)),
            159,
            IHyperCoreData(address(dataFeed)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            coreAcct,
            guardian,
            keeper,
            launchParams()
        );
        vm.prank(alice);
        vm.expectRevert();
        d.setToken(mako);
        vm.prank(gov);
        vm.expectRevert(MakoDesk.BadParams.selector);
        d.setToken(MakoToken(address(0)));
        vm.prank(gov);
        d.setToken(mako);
        assertEq(address(d.mako()), address(mako));
        vm.prank(gov);
        vm.expectRevert(MakoDesk.TokenAlreadySet.selector);
        d.setToken(MakoToken(address(1)));
    }

    /* ---------------- Governance ---------------- */
    function test_ParamsValidated() public {
        MakoDesk.Params memory p = launchParams();
        p.burnShareBps = 10_001;
        vm.prank(gov);
        vm.expectRevert(MakoDesk.BadParams.selector);
        desk.setParams(p);
        p = launchParams();
        p.quoteSzE8 = p.maxPositionSzE8 + 1;
        vm.prank(gov);
        vm.expectRevert(MakoDesk.BadParams.selector);
        desk.setParams(p);
    }

    function test_GovernanceThroughFortyEightHourTimelock() public {
        address multisig = makeAddr("multisig");
        address[] memory prop = new address[](1);
        prop[0] = multisig;
        TimelockController tl = new TimelockController(48 hours, prop, prop, address(0));
        MakoDesk d = new MakoDesk(
            address(tl),
            mako,
            159,
            IHyperCoreData(address(dataFeed)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            coreAcct,
            guardian,
            keeper,
            launchParams()
        );
        MakoDesk.Params memory p = launchParams();
        p.maxPositionSzE8 = 5_000e8;
        bytes memory call = abi.encodeCall(MakoDesk.setParams, (p));

        vm.prank(multisig);
        vm.expectRevert(); // direct calls are not the owner
        d.setParams(p);

        vm.prank(multisig);
        tl.schedule(address(d), 0, call, bytes32(0), bytes32(0), 48 hours);
        vm.prank(multisig);
        vm.expectRevert(); // too early
        tl.execute(address(d), 0, call, bytes32(0), bytes32(0));

        vm.warp(block.timestamp + 48 hours);
        vm.prank(multisig);
        tl.execute(address(d), 0, call, bytes32(0), bytes32(0));
        (uint256 maxPos,,,,,,,,,,,,,) = d.params();
        assertEq(maxPos, 5_000e8);
    }

    function test_OnlyOwnerAdministers() public {
        vm.startPrank(alice);
        vm.expectRevert();
        desk.setRoles(alice, alice);
        vm.expectRevert();
        desk.withdrawHype(payable(alice), 0, 0);
        vm.expectRevert(MakoDesk.NotAllowed.selector);
        desk.noteDeposit(1);
        vm.stopPrank();
    }
}
