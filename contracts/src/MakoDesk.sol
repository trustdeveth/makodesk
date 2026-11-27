// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IMakoDesk} from "./interfaces/IMakoDesk.sol";
import {IHyperCoreData} from "./interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter, ICoreFillReceiver} from "./interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "./interfaces/IBuybackRouter.sol";
import {MoodEngine} from "./libraries/MoodEngine.sol";
import {WickDetector} from "./libraries/WickDetector.sol";

/// @title MakoDesk
/// @notice Treasury market maker for $MAKO. Sense -> Decide -> Quote -> Settle:
///   - Sense:  reads HYPE-PERP from the HyperCore market-data precompile (via IHyperCoreData),
///             derives the Mood and runs the wick detector.
///   - Decide: fair price + inventory lean + mood spread, then checks every risk cap.
///   - Quote:  cancel/replace post-only quotes on HyperCore via ElysiumCoreWriter intents.
///   - Settle: per-epoch realized profit; burnShare of it (x mood / wick multiplier, never more
///             than the profit) becomes buyback budget, spent by buying MAKO into 0x...dEaD.
///
/// Roles:
///   owner    -> TimelockController (48h). Params, adapters, roles, resume after kill.
///   guardian -> multisig. Can kill instantly and record capital deposits. Cannot move funds.
///   keeper   -> bot. Funds/executes buybacks within the settled budget, notes profit withdrawals.
///   anyone   -> poke() (tipped), settle(), kill() when a limit is provably breached.
contract MakoDesk is IMakoDesk, ICoreFillReceiver, Ownable2Step, ReentrancyGuard {
    using WickDetector for WickDetector.Buffer;
    using SafeCast for uint256;
    using SafeCast for int256;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant BPS = 10_000;

    struct Params {
        uint256 maxPositionSzE8; // max |position|, base units E8 (launch: 2,500 HYPE)
        uint256 quoteSzE8; // size quoted per side
        uint256 maxDailyLossE6; // USD (launch: $4,000)
        uint16 maxDrawdownBps; // from high-water mark (launch: 15%)
        uint16 skewBandBps; // inventory band before quotes lean (launch: 40%)
        uint16 burnShareBps; // share of profit that is burned (launch: 80%)
        uint16 wickDropBps; // drop within the window that counts as a wick
        uint64 maxStaleBlocks; // core blocks of lag tolerated (~750 ms at ~70 ms/block)
        uint64 wickWindowBlocks; // core blocks the drop must happen within
        uint64 breachHoldBlocks; // how long Breach persists after a wick
        uint256 wickLiqE6; // liquidation notional needed to confirm a wick (0 = price only)
        uint32 epochLength; // seconds between settlements
        uint32 minTipInterval; // seconds between paid pokes
        uint96 pokeTip; // HYPE wei paid to a useful poke
    }

    /* ---------------- immutable config ---------------- */
    /// @notice $MAKO. Unset at deploy (token launches later on Montra); set once via the timelock.
    IERC20 public mako;
    uint32 public immutable asset; // HyperCore perp index of HYPE

    /* ---------------- governed config ---------------- */
    IHyperCoreData public data;
    ICoreOrderRouter public router;
    IBuybackRouter public swapRouter;
    address public coreAccount; // desk's HyperCore trading account
    address public guardian;
    address public keeper;
    Params public params;

    /* ---------------- mood / sense ---------------- */
    Mood private _mood = Mood.Cruising;
    int256 public lastFundingE8;
    uint256 public lastMidE8;
    uint64 public lastCoreBlock;
    uint64 public breachUntilBlock;
    bool public wickArmed;
    WickDetector.Buffer private _wick;

    /* ---------------- quotes / fills ---------------- */
    uint128 public quoteSeq;
    uint128 public activeBidCloid;
    uint128 public activeAskCloid;
    uint256 public lastQuoteMidE8;
    uint256 public lastPokeBlock;
    int256 public positionSzE8; // from fills (accounting); risk uses the precompile position
    uint256 public avgEntryE8;
    int256 public realizedPnlE6; // net of fees
    mapping(bytes32 => bool) public fillSeen;

    /* ---------------- risk ---------------- */
    bool public killed;
    uint64 public riskDay;
    uint64 public pausedUntilDay;
    int256 public dayStartEquityE6;
    int256 public hwmEquityE6;

    /* ---------------- epochs / burns ---------------- */
    uint256 public epoch;
    uint64 public epochStart;
    int256 public epochStartEquityE6;
    int256 public realizedAtEpochStartE6;
    uint256 public burnBudgetE6; // settled USD still to be spent on buybacks
    uint256 public withdrawableProfitE6; // settled USD the treasury may still pull from HyperCore
    bytes32 public pendingBurnReason;
    uint256 public burnHype; // HYPE (wei) earmarked for buybacks
    uint256 public tipPool; // HYPE (wei) for poke tips
    uint64 public lastTipAt;
    uint256 public totalBurned;

    /* ---------------- events (beyond IMakoDesk) ---------------- */
    event StaleData(uint64 dataBlock, uint64 latestBlock);
    event WickDetected(uint64 indexed coreBlock, uint256 dropBps, uint256 liqNotionalE6);
    event DailyLossPause(uint64 indexed day, int256 lossE6);
    event QuotesCancelled(uint64 indexed coreBlock);
    event Settled(uint256 indexed epoch, int256 realizedE6, int256 equityDeltaE6, uint256 burnBudgetE6, bool wickBonus);
    event Tipped(address indexed to, uint256 amount);
    event Resumed(address indexed by);
    event CapitalFlow(int256 deltaE6);
    event ParamsUpdated(Params p);
    event AdaptersUpdated(address data, address router, address swapRouter, address coreAccount);
    event TokenSet(address token);
    event RolesUpdated(address guardian, address keeper);

    error AlreadyPoked();
    error NotRouter();
    error NotKeeper();
    error NotAllowed();
    error EpochNotOver();
    error Stale();
    error OverBudget();
    error BadParams();
    error Killed();
    error InsufficientOutput();
    error NotWired();
    error TokenAlreadySet();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(
        address timelock,
        IERC20 mako_,
        uint32 asset_,
        IHyperCoreData data_,
        ICoreOrderRouter router_,
        IBuybackRouter swapRouter_,
        address coreAccount_,
        address guardian_,
        address keeper_,
        Params memory p
    ) Ownable(timelock) {
        mako = mako_;
        asset = asset_;
        data = data_;
        router = router_;
        swapRouter = swapRouter_;
        coreAccount = coreAccount_;
        guardian = guardian_;
        keeper = keeper_;
        _setParams(p);
        epochStart = uint64(block.timestamp);
        riskDay = _today();
        // Deploys halted: nothing quotes until adapters are wired and the timelock calls resume().
        killed = true;
        emit KillSwitch(msg.sender, "DEPLOYED_HALTED");
    }

    receive() external payable {
        tipPool += msg.value;
    }

    /* =================================================================
                                 VIEWS
       ================================================================= */

    function mood() external view returns (Mood) {
        return _mood;
    }

    function paused() public view returns (bool) {
        return killed || pausedUntilDay > _today();
    }

    function state() external view returns (DeskState memory s) {
        s.mood = _mood;
        s.fundingE8 = lastFundingE8;
        s.midPriceE8 = lastMidE8;
        s.positionE8 = positionSzE8;
        s.realizedPnlUsdE6 = realizedPnlE6;
        s.totalBurned = totalBurned;
        s.paused = paused();
        s.coreBlock = lastCoreBlock;
    }

    /* =================================================================
                          SENSE + DECIDE + QUOTE
       ================================================================= */

    /// @notice Run one desk cycle. Permissionless; pays `pokeTip` at most once per `minTipInterval`.
    function poke() external nonReentrant {
        if (lastPokeBlock == block.number) revert AlreadyPoked();
        lastPokeBlock = block.number;

        IHyperCoreData.Snapshot memory s = data.snapshot(asset);
        if (!_fresh(s)) {
            emit StaleData(s.coreBlock, data.latestCoreBlock());
            _cancelQuotes(s.coreBlock);
            return; // stale cycles never pay a tip
        }

        _sense(s);

        int256 eq = data.accountValueE6(coreAccount);
        _rollDay(eq);
        if (eq > hwmEquityE6) hwmEquityE6 = eq;

        if (!killed) {
            if (_drawdownBreached(eq)) {
                _kill(address(this), "MAX_DRAWDOWN", s.coreBlock);
            } else if (pausedUntilDay <= _today() && _dailyLossBreached(eq)) {
                pausedUntilDay = _today() + 1;
                emit DailyLossPause(_today(), dayStartEquityE6 - eq);
            }
        }

        if (paused()) _cancelQuotes(s.coreBlock);
        else _requote(s);

        _tip(msg.sender);
    }

    function _fresh(IHyperCoreData.Snapshot memory s) internal view returns (bool) {
        if (s.midE8 == 0 || s.bestBidE8 == 0 || s.bestAskE8 <= s.bestBidE8) return false;
        uint64 latest = data.latestCoreBlock();
        return latest < s.coreBlock || latest - s.coreBlock <= params.maxStaleBlocks;
    }

    function _sense(IHyperCoreData.Snapshot memory s) internal {
        Params memory p = params;
        _wick.push(s.coreBlock, s.midE8);
        uint256 drop = _wick.dropBps(s.coreBlock, s.midE8, p.wickWindowBlocks);
        if (drop >= p.wickDropBps && s.liqNotionalE6 >= p.wickLiqE6) {
            if (s.coreBlock >= breachUntilBlock) emit WickDetected(s.coreBlock, drop, s.liqNotionalE6);
            breachUntilBlock = s.coreBlock + p.breachHoldBlocks;
            wickArmed = true;
        }
        Mood m = s.coreBlock < breachUntilBlock ? Mood.Breach : MoodEngine.fromFunding(s.fundingE8);
        if (m != _mood) {
            emit MoodChanged(_mood, m, s.fundingE8);
            _mood = m;
        }
        lastFundingE8 = s.fundingE8;
        lastMidE8 = s.midE8;
        lastCoreBlock = s.coreBlock;
    }

    function _requote(IHyperCoreData.Snapshot memory s) internal {
        Params memory p = params;
        // authoritative position comes from HyperCore (covers missed or late callbacks)
        int256 pos = data.positionSzE8(coreAccount, asset);
        int256 maxPos = p.maxPositionSzE8.toInt256();

        // inventory lean: past the skew band, shift fair price against the inventory
        uint256 spreadX10 = MoodEngine.spreadBpsX10(_mood); // tenths of bps
        uint256 fair = s.midE8;
        int256 skewBps = maxPos == 0 ? int256(0) : (pos * int256(BPS)) / maxPos;
        uint256 absSkew = skewBps < 0 ? uint256(-skewBps) : uint256(skewBps);
        if (absSkew > p.skewBandBps) {
            uint256 over = absSkew > BPS ? BPS - p.skewBandBps : absSkew - p.skewBandBps;
            uint256 leanX10 = (over * spreadX10) / (BPS - p.skewBandBps); // up to one full spread
            fair = skewBps > 0 ? (fair * (100_000 - leanX10)) / 100_000 : (fair * (100_000 + leanX10)) / 100_000;
        }
        uint256 halfX10 = spreadX10 / 2;
        uint256 bid = (fair * (100_000 - halfX10)) / 100_000;
        uint256 ask = (fair * (100_000 + halfX10 + (spreadX10 % 2))) / 100_000;

        // size caps: never let a fill push |position| beyond maxPos
        uint256 bidSz = pos >= maxPos ? 0 : _min(p.quoteSzE8, uint256(maxPos - pos));
        uint256 askSz = pos <= -maxPos ? 0 : _min(p.quoteSzE8, uint256(maxPos + pos));
        // Breach: buy the flush. Only offer when already long past the skew band (to reduce).
        if (_mood == Mood.Breach && !(skewBps > int256(uint256(p.skewBandBps)))) askSz = 0;

        _cancelQuotes(s.coreBlock);
        uint128 seq = ++quoteSeq;
        if (bidSz != 0) {
            activeBidCloid = seq << 1;
            router.placeLimit(asset, true, bid, bidSz, true, activeBidCloid);
        }
        if (askSz != 0) {
            activeAskCloid = (seq << 1) | 1;
            router.placeLimit(asset, false, ask, askSz, true, activeAskCloid);
        }
        lastQuoteMidE8 = s.midE8;
        emit Quoted(s.coreBlock, bidSz != 0 ? bid : 0, askSz != 0 ? ask : 0, p.quoteSzE8);
    }

    function _cancelQuotes(uint64 coreBlock) internal {
        bool any;
        if (activeBidCloid != 0) {
            router.cancelByCloid(asset, activeBidCloid);
            activeBidCloid = 0;
            any = true;
        }
        if (activeAskCloid != 0) {
            router.cancelByCloid(asset, activeAskCloid);
            activeAskCloid = 0;
            any = true;
        }
        if (any) emit QuotesCancelled(coreBlock);
    }

    function _tip(address to) internal {
        Params memory p = params;
        if (p.pokeTip == 0 || tipPool < p.pokeTip || block.timestamp < uint256(lastTipAt) + p.minTipInterval) return;
        tipPool -= p.pokeTip;
        lastTipAt = uint64(block.timestamp);
        (bool ok,) = to.call{value: p.pokeTip, gas: 30_000}("");
        if (ok) emit Tipped(to, p.pokeTip);
        else tipPool += p.pokeTip; // contracts that refuse HYPE simply aren't tipped
    }

    /* =================================================================
                                 FILLS
       ================================================================= */

    /// @notice Fill outcome from ElysiumCoreWriter. Idempotent per `fillId`.
    function onFill(bytes32 fillId, uint128, bool isBuy, uint256 pxE8, uint256 szE8, uint256 feeE6, uint64 coreBlock)
        external
    {
        if (msg.sender != address(router)) revert NotRouter();
        if (fillSeen[fillId] || szE8 == 0) return;
        fillSeen[fillId] = true;

        int256 sz = isBuy ? szE8.toInt256() : -szE8.toInt256();
        int256 pos = positionSzE8;
        int256 px = pxE8.toInt256();
        int256 realized;

        if (pos == 0 || (pos > 0) == (sz > 0)) {
            uint256 absPos = _abs(pos);
            avgEntryE8 = (avgEntryE8 * absPos + pxE8 * szE8) / (absPos + szE8);
        } else {
            uint256 closing = _min(_abs(sz), _abs(pos));
            // (px - entry) * closing, signed by the side being closed; E8*E8/1e8 = E8 USD -> /100 = E6
            realized = ((px - avgEntryE8.toInt256()) * closing.toInt256() * (pos > 0 ? int256(1) : int256(-1))) / 1e10;
            if (_abs(sz) > closing) avgEntryE8 = pxE8; // flipped: remainder opens at fill price
            else if (pos + sz == 0) avgEntryE8 = 0;
        }
        positionSzE8 = pos + sz;
        realizedPnlE6 += realized - feeE6.toInt256();

        // edge vs the mid the quote was built on
        // (no quote yet, e.g. a manual/legacy order: edge is just the fee)
        int256 mid = lastQuoteMidE8 == 0 ? px : lastQuoteMidE8.toInt256();
        int256 edge = ((isBuy ? mid - px : px - mid) * szE8.toInt256()) / 1e10 - feeE6.toInt256();
        emit Filled(coreBlock, isBuy, pxE8, szE8, edge);
    }

    /* =================================================================
                                 RISK
       ================================================================= */

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function _rollDay(int256 eq) internal {
        uint64 d = _today();
        if (d != riskDay || dayStartEquityE6 == 0) {
            riskDay = d;
            dayStartEquityE6 = eq;
        }
        if (hwmEquityE6 == 0) hwmEquityE6 = eq;
        if (epochStartEquityE6 == 0) epochStartEquityE6 = eq;
    }

    function _dailyLossBreached(int256 eq) internal view returns (bool) {
        return dayStartEquityE6 - eq >= params.maxDailyLossE6.toInt256();
    }

    function _drawdownBreached(int256 eq) internal view returns (bool) {
        int256 hwm = hwmEquityE6;
        if (hwm <= 0) return false;
        return (hwm - eq) * int256(BPS) >= hwm * int256(uint256(params.maxDrawdownBps));
    }

    /// @notice True when any documented limit is breached right now (makes kill() permissionless).
    function provableBreach() public view returns (bool) {
        IHyperCoreData.Snapshot memory s = data.snapshot(asset);
        bool quotesLive = activeBidCloid != 0 || activeAskCloid != 0;
        if (quotesLive && !_fresh(s)) return true;
        if (_abs(data.positionSzE8(coreAccount, asset)) > params.maxPositionSzE8) return true;
        int256 eq = data.accountValueE6(coreAccount);
        if (_drawdownBreached(eq)) return true;
        if (riskDay == _today() && dayStartEquityE6 != 0 && _dailyLossBreached(eq)) return true;
        return false;
    }

    /// @notice Kill-switch. Guardian/owner any time; anyone else only on a provable breach.
    function kill(bytes32 reason) external nonReentrant {
        if (msg.sender != guardian && msg.sender != owner() && !provableBreach()) revert NotAllowed();
        _kill(msg.sender, reason, lastCoreBlock);
    }

    function _kill(address by, bytes32 reason, uint64 coreBlock) internal {
        killed = true;
        _cancelQuotes(coreBlock);
        emit KillSwitch(by, reason);
    }

    /// @notice Resume after a kill. Timelocked (owner = TimelockController).
    function resume() external onlyOwner {
        if (address(data) == address(0) || address(router) == address(0) || coreAccount == address(0)) {
            revert NotWired();
        }
        killed = false;
        int256 eq = data.accountValueE6(coreAccount);
        hwmEquityE6 = eq; // reset the drawdown reference to current capital
        dayStartEquityE6 = eq;
        riskDay = _today();
        emit Resumed(msg.sender);
    }

    /* =================================================================
                          SETTLE + BUYBACK & BURN
       ================================================================= */

    /// @notice Close the epoch. Profit = min(realized fill PnL, equity change) so funding or
    ///         unrealized losses are never burned. Losing epochs burn nothing.
    function settle() external nonReentrant {
        Params memory p = params;
        if (block.timestamp < uint256(epochStart) + p.epochLength) revert EpochNotOver();
        int256 eq = data.accountValueE6(coreAccount);
        if (epochStartEquityE6 == 0) epochStartEquityE6 = eq;

        int256 realizedDelta = realizedPnlE6 - realizedAtEpochStartE6;
        int256 equityDelta = eq - epochStartEquityE6;
        int256 profit = realizedDelta < equityDelta ? realizedDelta : equityDelta;
        bool wick = wickArmed;
        uint256 budget;
        if (profit > 0) {
            uint256 mult = wick ? 20_000 : MoodEngine.burnMultiplierBps(_mood);
            uint256 prof = uint256(profit);
            budget = (prof * p.burnShareBps * mult) / (BPS * BPS);
            if (budget > prof) budget = prof; // burns are only ever funded by realized profit
            burnBudgetE6 += budget;
            withdrawableProfitE6 += budget;
            pendingBurnReason = wick ? bytes32("Wick bonus") : bytes32("Desk profit");
        }
        emit Settled(epoch, realizedDelta, equityDelta, budget, wick);

        epoch++;
        epochStart = uint64(block.timestamp);
        realizedAtEpochStartE6 = realizedPnlE6;
        epochStartEquityE6 = eq;
        wickArmed = false;
    }

    /// @notice Keeper brings settled profit back to Elysium as HYPE and earmarks it for burns.
    function depositForBurn() external payable onlyKeeper {
        burnHype += msg.value;
    }

    /// @notice Buy MAKO with earmarked HYPE and send it straight to the burn address.
    /// @dev Spend is capped by the settled USD budget at the current HYPE mid.
    function buybackAndBurn(uint256 hypeIn, uint256 minMakoOut, uint256 deadline)
        external
        onlyKeeper
        nonReentrant
        returns (uint256 burned)
    {
        if (address(mako) == address(0) || address(swapRouter) == address(0)) revert NotWired();
        if (hypeIn == 0 || hypeIn > burnHype) revert OverBudget();
        IHyperCoreData.Snapshot memory s = data.snapshot(asset);
        if (!_fresh(s)) revert Stale();
        uint256 usdE6 = (hypeIn * s.midE8) / 1e20; // 1e18 wei * 1e8 px -> 1e6 USD
        if (usdE6 > burnBudgetE6) revert OverBudget();
        burnHype -= hypeIn;
        burnBudgetE6 -= usdE6;

        uint256 before = mako.balanceOf(DEAD);
        swapRouter.buy{value: hypeIn}(address(mako), DEAD, minMakoOut, deadline);
        burned = mako.balanceOf(DEAD) - before;
        if (burned < minMakoOut) revert InsufficientOutput();
        totalBurned += burned;
        emit Burned(burned, pendingBurnReason, epoch == 0 ? 0 : epoch - 1);
    }

    /// @notice Treasury pulled settled profit off HyperCore for buybacks: lower the risk
    ///         baselines so the withdrawal is not mistaken for a trading loss.
    function noteProfitWithdrawal(uint256 amountE6) external onlyKeeper {
        if (amountE6 > withdrawableProfitE6) revert OverBudget();
        withdrawableProfitE6 -= amountE6;
        _shiftBaselines(-amountE6.toInt256());
    }

    /// @notice Capital added to the HyperCore account (raises baselines; can only tighten risk).
    function noteDeposit(uint256 amountE6) external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotAllowed();
        _shiftBaselines(amountE6.toInt256());
    }

    function _shiftBaselines(int256 d) internal {
        if (dayStartEquityE6 != 0) dayStartEquityE6 += d;
        if (hwmEquityE6 != 0) hwmEquityE6 += d;
        if (epochStartEquityE6 != 0) epochStartEquityE6 += d;
        emit CapitalFlow(d);
    }

    /* =================================================================
                           GOVERNANCE (timelocked)
       ================================================================= */

    function setParams(Params calldata p) external onlyOwner {
        _setParams(p);
    }

    function _setParams(Params memory p) internal {
        if (
            p.maxPositionSzE8 == 0 || p.quoteSzE8 == 0 || p.quoteSzE8 > p.maxPositionSzE8 || p.maxDailyLossE6 == 0
                || p.maxDrawdownBps == 0 || p.maxDrawdownBps > 5_000 || p.skewBandBps >= BPS || p.burnShareBps > BPS
                || p.wickDropBps == 0 || p.maxStaleBlocks == 0 || p.wickWindowBlocks == 0 || p.epochLength < 1 hours
        ) revert BadParams();
        params = p;
        emit ParamsUpdated(p);
    }

    function setAdapters(
        IHyperCoreData data_,
        ICoreOrderRouter router_,
        IBuybackRouter swapRouter_,
        address coreAccount_
    ) external onlyOwner {
        // quotes were placed through the old router; drop our references to them
        activeBidCloid = 0;
        activeAskCloid = 0;
        data = data_;
        router = router_;
        swapRouter = swapRouter_;
        coreAccount = coreAccount_;
        emit AdaptersUpdated(address(data_), address(router_), address(swapRouter_), coreAccount_);
    }

    /// @notice Set the $MAKO contract address once, after the Montra launch. Cannot be changed later.
    function setToken(IERC20 token) external onlyOwner {
        if (address(mako) != address(0)) revert TokenAlreadySet();
        if (address(token) == address(0)) revert BadParams();
        mako = token;
        emit TokenSet(address(token));
    }

    function setRoles(address guardian_, address keeper_) external onlyOwner {
        guardian = guardian_;
        keeper = keeper_;
        emit RolesUpdated(guardian_, keeper_);
    }

    /// @notice Timelocked escape hatch for HYPE held by the contract (tips or burn funds).
    function withdrawHype(address payable to, uint256 fromTips, uint256 fromBurn) external onlyOwner {
        tipPool -= fromTips;
        burnHype -= fromBurn;
        (bool ok,) = to.call{value: fromTips + fromBurn}("");
        if (!ok) revert NotAllowed();
    }

    /* ---------------- utils ---------------- */
    function _abs(int256 x) private pure returns (uint256) {
        return x < 0 ? uint256(-x) : uint256(x);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
